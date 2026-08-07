-- ============================================================================
-- 0022_people.sql                                                6 Aug 2026
--
-- PEOPLE BECOME FIRST-CLASS. Identity is the CONTACT, never the name.
--
-- THE BUG THIS FIXES: members.circle_id is NOT NULL, so a member row belongs to
-- exactly ONE circle. "shapiro" in ski and "shapiro" in leros were unrelated
-- rows. The duplicate guard's final test was `norm(x.name) === norm(name)` —
-- name equality — so three Marks and five Bobs collapse into each other while
-- one person in three circles stays three strangers. dan's rule: the phone,
-- email or linkedin account is the identity; a name is only a convenience for
-- finding someone.
--
-- DESIGN CHOICE — ADDITIVE, NOT A REWRITE:
-- `members` REMAINS A TABLE and keeps every column and id. It gains person_id.
-- It is NOT replaced by a view, because:
--   * query_responses.member_id has an FK to members(id) — history depends on
--     those ids surviving
--   * eight edge functions and 45 client references read/write members
--   * saveMembers() UPSERTS; a view is not writable without INSTEAD OF triggers
-- So the person model is added alongside, the app keeps working untouched, and
-- the new UI can be built against people/person_contacts separately. Schema and
-- UI ship as two steps rather than one irreversible one.
--
-- Idempotent. Safe on production. Adds rows and columns; deletes nothing.
-- ============================================================================

-- ── people: one row per human you know ──────────────────────────────────────
create table if not exists public.people (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users(id) on delete cascade,
  name           text not null,
  avatar         text,
  avatar_color   text default '#217A4B',
  linked_user_id uuid references public.users(id) on delete set null,
  response_rate  text default 'unknown',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_people_owner on public.people (owner_id);
create index if not exists idx_people_linked on public.people (linked_user_id)
  where linked_user_id is not null;

-- ── person_contacts: MANY per person — this is where identity lives ─────────
-- A person may hold a phone AND an email AND a linkedin. Matching ANY of them
-- means the same person. `key` is the normalised comparison form: last 9 digits
-- for a phone (the same rule phone_key() and wa-signin already use), lowercased
-- and trimmed for anything else. One normalisation rule, not two — a second
-- implementation of one rule is what produced the classify-rec and
-- match_canonical bugs earlier this week.
create table if not exists public.person_contacts (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people(id) on delete cascade,
  owner_id   uuid not null references public.users(id) on delete cascade,
  method     text not null check (method in ('email','whatsapp','linkedin')),
  value      text not null,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pc_person on public.person_contacts (person_id);
create index if not exists idx_pc_lookup on public.person_contacts (owner_id, method, key);

-- The normaliser. Phones reuse phone_key() from 0017; everything else is
-- lower+trim. Declared IMMUTABLE so it can back an index.
create or replace function public.contact_key(p_method text, p_value text)
returns text language sql immutable as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    when p_method = 'whatsapp' then phone_key(p_value)
    else lower(btrim(p_value))
  end;
$$;

-- ── members gains a person, keeping everything else ─────────────────────────
alter table public.members add column if not exists person_id uuid
  references public.people(id) on delete cascade;
create index if not exists idx_members_person on public.members (person_id);

-- ── BACKFILL — group existing members by CONTACT, never by name ─────────────
do $$
declare
  r        record;
  v_person uuid;
  v_key    text;
begin
  -- 1. every member WITH a contact: one person per (owner, method, key)
  for r in
    select owner_id,
           contact_method as method,
           public.contact_key(contact_method, contact_value) as key,
           -- person's name: the most frequently used, ties broken by the most
           -- recent. Names are display only; they never decide identity.
           (array_agg(name order by cnt desc, last_seen desc))[1] as best_name,
           bool_or(linked) as any_linked,
           (array_agg(linked_user_id) filter (where linked_user_id is not null))[1] as luid,
           (array_agg(contact_value order by last_seen desc))[1] as raw_value
    from (
      select m.owner_id, m.contact_method, m.contact_value, m.name,
             m.linked_user_id, (m.linked_user_id is not null) as linked,
             count(*) over (partition by m.owner_id,
                            public.contact_key(m.contact_method, m.contact_value),
                            m.name) as cnt,
             max(m.created_at) over (partition by m.owner_id,
                            public.contact_key(m.contact_method, m.contact_value),
                            m.name) as last_seen
      from public.members m
      where m.person_id is null
        and public.contact_key(m.contact_method, m.contact_value) is not null
    ) s
    group by owner_id, contact_method, public.contact_key(contact_method, contact_value)
  loop
    -- reuse a person already holding this exact contact
    select pc.person_id into v_person
    from public.person_contacts pc
    where pc.owner_id = r.owner_id and pc.method = r.method and pc.key = r.key
    limit 1;

    if v_person is null then
      insert into public.people (owner_id, name, linked_user_id)
      values (r.owner_id, r.best_name, r.luid)
      returning id into v_person;

      insert into public.person_contacts (person_id, owner_id, method, value, key)
      values (v_person, r.owner_id, r.method, r.raw_value, r.key);
    end if;

    update public.members m
    set person_id = v_person
    where m.person_id is null
      and m.owner_id = r.owner_id
      and public.contact_key(m.contact_method, m.contact_value) = r.key;
  end loop;

  -- 2. members with NO contact at all (the empty-details bug) get their OWN
  --    person each. Grouping them by name would be exactly the guess this
  --    migration exists to remove. Under-merging is correctable by hand;
  --    a wrong merge silently fuses two different humans.
  for r in select id, owner_id, name, linked_user_id from public.members
           where person_id is null
  loop
    insert into public.people (owner_id, name, linked_user_id)
    values (r.owner_id, r.name, r.linked_user_id)
    returning id into v_person;
    update public.members set person_id = v_person where id = r.id;
  end loop;
end $$;

-- ── ONE CONTACT BELONGS TO ONE PERSON — rule 1, enforced by the database ────
-- Applied AFTER the backfill: the grouping above creates exactly one person per
-- distinct contact, so the data already satisfies this. Adding it first would
-- have rejected the existing rows before they could be resolved.
create unique index if not exists person_contacts_identity_uniq
  on public.person_contacts (owner_id, method, key);

alter table public.people          enable row level security;
alter table public.person_contacts enable row level security;
drop policy if exists people_owner on public.people;
create policy people_owner on public.people
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists person_contacts_owner on public.person_contacts;
create policy person_contacts_owner on public.person_contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from public.people)                            as people,
  (select count(*) from public.person_contacts)                   as contacts,
  (select count(*) from public.members where person_id is null)   as unassigned_should_be_0,
  (select count(*) from (
     select person_id, circle_id from public.members
     group by person_id, circle_id having count(*) > 1) d)        as same_circle_duplicates;
