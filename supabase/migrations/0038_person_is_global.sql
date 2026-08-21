-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — the contact is the person, across the whole app
--
-- THE RULE (dan, 20 Aug 2026)
--   One phone number or one email means ONE human, once, everywhere. Not once
--   per address book. Each owner keeps their own LABEL for that person — that
--   lives on members.name and does not move — but the identity underneath is
--   shared. Names never identify anybody: only a contact key does.
--
-- WHAT IS WRONG TODAY
--   0022's own header states this rule. The schema implemented it one scope
--   too small: people.owner_id is not null and person_contacts is unique on
--   (owner_id, method, key). So the same phone legitimately produces a
--   separate person row in every account that holds it.
--
--   Measured on production, 20 Aug 2026: 42 person rows are 26 humans.
--   Key 505543402 alone exists as FIVE people across five accounts. Each of
--   those five decides independently whether that human is on Trustnet, which
--   is why 16 of 40 members with a contact have no linked_user_id and their
--   owners' taste-match inboxes are silent. There is no error for this. It
--   simply never arrives.
--
-- WHAT THIS DOES NOT DO
--   It deletes no member row, no answer, no recommendation and no contact.
--   Person rows are MERGED, not removed: the survivor absorbs the rest and
--   every reference is re-pointed first.
--
-- WHY MERGING IS SAFE HERE, AND WHEN IT WOULD STOP BEING
--   Every person in this app arrived because an owner typed their contact in.
--   There is no forwarding feature — checked, not assumed. So a shared person
--   record can never show an owner a contact they did not already have. IF A
--   FEATURE EVER LETS A PERSON APPEAR WITHOUT AN OWNER ENTERING THEM, THIS
--   ASSUMPTION DIES AND THE RLS IN 0039 MUST BE REVISITED.
--
-- HOW TO RUN THIS — READ BEFORE PASTING
--   The Supabase SQL editor sends EACH STATEMENT ON ITS OWN CONNECTION.
--   Proven 20 Aug: `begin; create table t; create temporary table tmp ...;`
--   fails on tmp not existing while t survives. So there is NO transaction
--   here, no begin/commit and no temp tables — they would be theatre implying
--   an atomicity you do not have. That is exactly how 0036 half-applied.
--
--   RUN ONE STATEMENT AT A TIME, IN ORDER. Every statement is idempotent and
--   safe to re-run. After each numbered block there is a CHECK — run it and
--   read it before moving on. If a statement fails, everything before it has
--   applied and everything after has not; fix and continue from that number.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · the merge map: which person row survives for each contact key ───────
-- A real table, not a temp table: it must survive between statements, and it
-- is the record of what was done if anything needs unpicking later.
-- Survivor = the OLDEST person row on that key. Synthetic WhatsApp addresses
-- (@wa.trustnet.local) are auth-system plumbing, never a contact, and are
-- excluded from identity entirely.
create table if not exists public.person_merge_map (
  from_person uuid primary key,
  to_person   uuid not null,
  method      text not null,
  key         text not null,
  noted_at    timestamptz not null default now()
);

-- CHECK 1
-- select count(*) as map_exists from information_schema.tables
--  where table_schema='public' and table_name='person_merge_map';


-- ── 2 · populate it ─────────────────────────────────────────────────────────
insert into public.person_merge_map (from_person, to_person, method, key)
select m.person_id, m.merged_into, m.method, m.key
  from (
    select pc.person_id, pc.method, pc.key,
           first_value(pc.person_id) over (
             partition by pc.method, pc.key
             order by p.created_at, pc.person_id) as merged_into
      from public.person_contacts pc
      join public.people p on p.id = pc.person_id
     where pc.value not like '%@wa.trustnet.local'
  ) m
 where m.person_id <> m.merged_into
on conflict (from_person) do nothing;

-- CHECK 2 — expect 16 rows folding into 8 survivors
-- select count(*) as folding, count(distinct to_person) as survivors
--   from public.person_merge_map;


-- ── 3 · re-point members ────────────────────────────────────────────────────
update public.members m
   set person_id = x.to_person
  from public.person_merge_map x
 where m.person_id = x.from_person;

-- CHECK 3 — expect 0
-- select count(*) as still_pointing_at_merged from public.members m
--   join public.person_merge_map x on x.from_person = m.person_id;


-- ── 4 · re-point suggestions ────────────────────────────────────────────────
-- suggestions.from_person_id references people ON DELETE SET NULL. Found by
-- auditing the repo, not by memory — 0036 re-pointed three foreign keys and
-- this is a fourth. A dropped suggestion is silent, which is why it matters.
update public.suggestions s
   set from_person_id = x.to_person
  from public.person_merge_map x
 where s.from_person_id = x.from_person;

-- CHECK 4 — expect 0
-- select count(*) as suggestions_pointing_at_merged from public.suggestions s
--   join public.person_merge_map x on x.from_person = s.from_person_id;


-- ── 5 · canonical contact value: valid E.164 wins ───────────────────────────
-- THIS MUST RUN BEFORE THE DUPLICATE CONTACT ROWS ARE DELETED. In the first
-- draft it ran after, and by then the only surviving row for a key might be
-- the bad one — there was nothing left to choose from, and the undialable
-- number won. Caught by a negative test, not by reading.
-- Several rows can share a key with different stored text. +9720545543107 and
-- +972545543107 both reduce to 545543107, but the first is NOT DIALABLE: after
-- country code 972 a national number may not begin with 0. phone_key hid that
-- at the identity layer while it stayed live at the delivery layer.
--
-- E.164 shape alone does NOT catch this, and my first draft got it wrong:
-- '^\+[1-9][0-9]{6,14}$' MATCHES +9720545543107, because the offending zero is
-- after the country code and the pattern cannot know 972 is a country code.
-- Detecting it properly needs a country-code table; this migration is cleaning
-- legacy rows, not validating input, so it uses the property that a spurious
-- leading zero always makes the number ONE DIGIT LONGER than the correct form
-- of the same key. Shortest valid form wins, oldest breaks a tie.
--
-- Input validation is Rule 2's job — a country selector plus a national field
-- — and once that ships, no new row can carry this fault.
update public.person_contacts pc
   set value = best.value
  from (
    select key, method,
           (array_agg(value order by
              case when method <> 'whatsapp' then 0
                   when value ~ '^\+[1-9][0-9]{6,14}$' then 0
                   else 1 end,
              case when method = 'whatsapp'
                   then length(regexp_replace(value, '\D', '', 'g'))
                   else 0 end,
              created_at))[1] as value
      from public.person_contacts
     group by key, method
  ) best
 where pc.key = best.key and pc.method = best.method
   and pc.value is distinct from best.value;


-- CHECK 5 - expect none
-- select value from public.person_contacts
--  where method='whatsapp' and value !~ '^\+[1-9][0-9]{6,14}$';


-- ── 6 · move contacts onto the survivor, dropping the now-duplicate rows ────
-- The survivor already holds this (method,key) — that is what made it the
-- survivor — so the folded rows are redundant and are deleted, not moved.
delete from public.person_contacts pc
 using public.person_merge_map x
 where pc.person_id = x.from_person
   and pc.method = x.method
   and pc.key = x.key;

-- Any OTHER contact a folded person held moves across intact.
update public.person_contacts pc
   set person_id = x.to_person
  from public.person_merge_map x
 where pc.person_id = x.from_person;

-- CHECK 6 - expect 0
-- select count(*) as contacts_on_merged_people from public.person_contacts pc
--   join public.person_merge_map x on x.from_person = pc.person_id;


-- ── 7 · delete the folded person rows ───────────────────────────────────────
-- Safe only now: members, suggestions and contacts all point elsewhere.
delete from public.people p
 using public.person_merge_map x
 where p.id = x.from_person;

-- CHECK 7 - expect people = 26
-- select count(*) as people from public.people;


-- CHECK 7 — expect none
-- select value from public.person_contacts
--  where method='whatsapp' and value !~ '^\+[1-9][0-9]{6,14}$';


-- ── 8 · one contact, one person — enforced ──────────────────────────────────
-- The rule itself. owner_id leaves the uniqueness: it was what made the same
-- phone a different person in every address book.
drop index if exists public.person_contacts_identity_uniq;
create unique index if not exists person_contacts_identity_uniq
  on public.person_contacts (method, key);

-- CHECK 8
-- select indexdef from pg_indexes where indexname='person_contacts_identity_uniq';


-- ── 8b · the identity trigger must follow the index it names ────────────────
-- 0036's member_identity() says `on conflict (owner_id, method, key)`. Step 8
-- just dropped that index, so the conflict target now matches nothing and
-- Postgres refuses the whole statement:
--     ERROR: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification
-- EVERY member insert carrying a contact would fail — the app would be unable
-- to add anybody. Found by running the sequence end to end, not by reading it:
-- 0036 and 0038 were each correct alone and inconsistent together.
--
-- Identical to 0036's version except for the conflict target and the owner_id
-- written on the contact row, which is now provenance rather than identity.
create or replace function public.member_identity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key    text;
  v_person uuid;
  v_n      integer;
  v_user   uuid;
begin
  v_key := public.contact_key(new.contact_method, new.contact_value);

  if v_key is null then
    return new;          -- no contact: no person, no link, and that is honest
  end if;

  -- Identity is GLOBAL now: one contact, one person, across the whole app.
  -- No owner filter — that filter was what made the same phone number a
  -- different person in every address book.
  if new.person_id is null then
    select pc.person_id into v_person
      from public.person_contacts pc
     where pc.key = v_key and pc.method = new.contact_method
     order by pc.created_at, pc.id
     limit 1;

    if v_person is null and new.contact_method in ('email','whatsapp','linkedin') then
      insert into public.people (owner_id, name, avatar, avatar_color, response_rate)
      values (new.owner_id, new.name, new.avatar,
              coalesce(new.avatar_color, '#217A4B'),
              coalesce(new.response_rate, 'unknown'))
      returning id into v_person;
    end if;

    new.person_id := v_person;
  end if;

  if new.person_id is not null
     and new.contact_method in ('email','whatsapp','linkedin') then
    insert into public.person_contacts (person_id, owner_id, method, value, key)
    values (new.person_id, new.owner_id, new.contact_method, new.contact_value, v_key)
    on conflict (method, key) do nothing;
  end if;

  -- Links ONLY when exactly one user matches. Under-linking reads as "not on
  -- Trustnet" and is correctable; a wrong link silently routes one person's
  -- questions to another and nothing re-checks it. Synthetic WhatsApp
  -- addresses are auth plumbing and can never be an identity.
  if new.linked_user_id is null then
    select count(*), (array_agg(u.id))[1] into v_n, v_user
      from public.users u
     where (new.contact_method = 'email'
            and lower(u.email) = v_key
            and u.email not like '%@wa.trustnet.local')
        or (new.contact_method = 'whatsapp' and public.phone_key(u.phone) = v_key);
    if v_n = 1 then
      new.linked_user_id := v_user;
    end if;
  end if;

  return new;
end $$;

-- CHECK 8b - adding a member on a contact another account already knows must
-- SUCCEED and reuse the existing person:
-- insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
--   values ('<one of your circles>', auth.uid(), 'probe', 'whatsapp', '<a known number>')
--   returning person_id;   -- then delete it again


-- ── 9 · owner_id stops being identity ───────────────────────────────────────
-- A shared person cannot belong to one account. Made NULLABLE rather than
-- dropped: two reversible steps instead of one irreversible one, which is the
-- principle 0022 set out. It stays as provenance — who introduced the contact
-- — and nothing should read it for access control after 0039.
alter table public.people alter column owner_id drop not null;

-- CHECK 9
-- select is_nullable from information_schema.columns
--  where table_name='people' and column_name='owner_id';


-- ── 10 · relink every person, once, with the correct normaliser ─────────────
-- This is the statement that turns the taste-match feed back on. Links only
-- when EXACTLY ONE user matches: under-linking reads as "not on Trustnet" and
-- is correctable; a wrong link silently routes one person's questions to
-- another and nothing re-checks it. Synthetic addresses cannot match.
update public.people p
   set linked_user_id = m.uid
  from (
    select pc.person_id, min(u.id::text)::uuid as uid, count(distinct u.id) as n
      from public.person_contacts pc
      join public.users u
        on (pc.method = 'email'    and lower(u.email) = pc.key
            and u.email not like '%@wa.trustnet.local')
        or (pc.method = 'whatsapp' and public.phone_key(u.phone) = pc.key)
     group by pc.person_id
    having count(distinct u.id) = 1
  ) m
 where p.id = m.person_id
   and p.linked_user_id is distinct from m.uid;

update public.members mem
   set linked_user_id = p.linked_user_id
  from public.people p
 where mem.person_id = p.id
   and p.linked_user_id is not null
   and mem.linked_user_id is distinct from p.linked_user_id;

-- CHECK 10 — members with a contact that are still unlinked but whose person
-- IS linked. Expect 0.
-- select count(*) as should_be_zero
--   from public.members m join public.people p on p.id = m.person_id
--  where m.linked_user_id is null and p.linked_user_id is not null;


-- ── 11 · verification ───────────────────────────────────────────────────────
-- select 'people' as k, count(*)::text v from public.people
-- union all select 'person_contacts', count(*)::text from public.person_contacts
-- union all select 'one key on >1 person',
--   coalesce((select count(*)::text from (select 1 from public.person_contacts
--     group by method, key having count(distinct person_id) > 1) t), '0')
-- union all select 'members with a contact', count(*)::text from public.members
--   where contact_value is not null
-- union all select 'of those, linked', count(*)::text from public.members
--   where contact_value is not null and linked_user_id is not null;


-- ── ROLLING BACK ────────────────────────────────────────────────────────────
-- person_merge_map is the record of every fold. It is NOT dropped by this
-- migration, deliberately: without it, a merge cannot be unpicked. Drop it
-- only once the merge has been live and correct for a while.
