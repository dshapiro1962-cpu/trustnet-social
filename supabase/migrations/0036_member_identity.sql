-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — one identity rule for members, enforced by the database
--
-- WHAT WAS WRONG (20 Aug 2026)
-- Nine writers create member rows. Exactly ONE of them — handleSaveMember —
-- registered the contact in person_contacts and joined the row to a person.
-- The other eight did not, including two edge functions a client-side helper
-- can never reach. That produced two different duplicate mechanisms:
--
--   mode 1  contact never registered   -> resolve_contact returns 'free'
--                                      -> a second member is created SILENTLY
--   mode 2  contact registered, member not joined to the person
--                                      -> resolve_contact returns 'found_person'
--                                         instead of 'in_circle', the app asks
--                                         "same person?", the user says yes,
--                                         and it duplicates WITH the app's
--                                         blessing. Worse: the app appears to
--                                         have checked.
--
-- WHY A TRIGGER AND NOT A SHARED FUNCTION
-- "Every producer must call the helper" has been tried twice and failed twice
-- — buildMember is already a shared choke point and person creation was still
-- left out of six of seven paths. A trigger cannot be forgotten by a new
-- producer, by an edge function, or by a hand-written dashboard insert. The
-- nine contactless rows in production were written by something none of us can
-- identify; whatever it was, this catches it.
--
-- IT ALSO REPLACES link_member_row, which was live and unversioned:
--     where lower(email) = lower(new.contact_value) or phone = new.contact_value
-- Raw string equality on phone. A member stored '+972505543402' only matched a
-- user whose phone column held that exact text — so 24 of 48 members read as
-- strangers. It also used `limit 1` with no `order by`: with two candidates it
-- assigned an arbitrary human, permanently, since nothing re-checks the field.
--
-- SAFETY
-- Runs as one transaction. The old trigger is dropped BEFORE the repair so it
-- cannot fight the backfill. The unique index is created LAST so that if any
-- duplicate survives, this migration aborts loudly instead of half-applying.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── 1 · the wrong trigger goes first, so it cannot interfere ────────────────
drop trigger if exists trg_members_autolink on public.members;
drop function if exists public.link_member_row();

-- ── 2 · contact_key on every row (it was never populated) ───────────────────
update public.members
   set contact_key = public.contact_key(contact_method, contact_value)
 where contact_key is distinct from public.contact_key(contact_method, contact_value);

-- ── 3 · a member with a contact must have a PERSON.
--        Reuse the person that already holds the contact; only create when the
--        contact is genuinely unknown. Never group by name — that is the guess
--        the people model exists to eliminate. ───────────────────────────────
update public.members m
   set person_id = pc.person_id
  from public.person_contacts pc
 where m.person_id is null
   and m.contact_key is not null
   and pc.owner_id = m.owner_id
   and pc.key = m.contact_key;

do $$
declare r record; v_person uuid;
begin
  for r in
    select m.id, m.owner_id, m.name, m.avatar, m.avatar_color,
           m.response_rate, m.contact_method, m.contact_value, m.contact_key
      from public.members m
     where m.person_id is null
       and m.contact_key is not null
       and m.contact_method in ('email','whatsapp','linkedin')
     order by m.created_at
  loop
    -- another row in this same loop may have just registered the contact
    select pc.person_id into v_person
      from public.person_contacts pc
     where pc.owner_id = r.owner_id and pc.key = r.contact_key
     limit 1;

    if v_person is null then
      insert into public.people (owner_id, name, avatar, avatar_color, response_rate)
      values (r.owner_id, r.name, r.avatar,
              coalesce(r.avatar_color, '#217A4B'),
              coalesce(r.response_rate, 'unknown'))
      returning id into v_person;

      insert into public.person_contacts (person_id, owner_id, method, value, key)
      values (v_person, r.owner_id, r.contact_method, r.contact_value, r.contact_key)
      on conflict (owner_id, method, key) do nothing;
    end if;

    update public.members set person_id = v_person where id = r.id;
    raise notice 'registered % (%) -> person %', r.name, r.contact_value, v_person;
  end loop;
end $$;

-- ── 4 · collapse duplicate memberships: same owner, same circle, same person.
--        SURVIVOR RULE: the row holding answers wins; ties break to the OLDER
--        row. Answers are the product — a repair that orphans one is worse
--        than the duplicate it removes. ALL THREE foreign keys are re-pointed,
--        not just query_responses: recommendations and invites reference
--        members too, and every one of them is ON DELETE SET NULL, so a plain
--        delete would silently erase provenance rather than fail. ───────────
create temporary table _collapse on commit drop as
with ranked as (
  select m.id, m.owner_id, m.circle_id, m.person_id,
         row_number() over (
           partition by m.owner_id, m.circle_id, m.person_id
           order by (select count(*) from public.query_responses q where q.member_id = m.id) desc,
                    m.created_at asc,
                    m.id asc
         ) as rn,
         first_value(m.id) over (
           partition by m.owner_id, m.circle_id, m.person_id
           order by (select count(*) from public.query_responses q where q.member_id = m.id) desc,
                    m.created_at asc,
                    m.id asc
         ) as survivor
    from public.members m
   where m.person_id is not null
)
select id as loser, survivor from ranked where rn > 1;

update public.query_responses q set member_id = c.survivor
  from _collapse c where q.member_id = c.loser;
update public.recommendations r set recommended_by_member_id = c.survivor
  from _collapse c where r.recommended_by_member_id = c.loser;
update public.invites i set member_id = c.survivor
  from _collapse c where i.member_id = c.loser;

delete from public.members m using _collapse c where m.id = c.loser;

-- ── 5 · an absence must read as an absence.
--        'app' was never a delivery channel — it is what MEMBER_FIELDS wrote
--        when contactMethod was empty, turning "we never learned how to reach
--        this person" into "reach them in the app". These rows are NOT
--        deleted: they keep their history, and the UI now says plainly that
--        the person cannot be reached. ──────────────────────────────────────
update public.members
   set contact_method = null
 where contact_method = 'app';

-- ── 6 · the rule, enforced on every write from every source ─────────────────
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
  new.contact_key := v_key;

  if v_key is null then
    return new;          -- no contact: no person, no link, and that is honest
  end if;

  -- PERSON. Only derived when absent: the client's edit path resolves identity
  -- itself and passes person_id explicitly, and silently re-pointing a
  -- membership at a different person on edit would be magic, not enforcement.
  if new.person_id is null then
    select pc.person_id into v_person
      from public.person_contacts pc
     where pc.owner_id = new.owner_id and pc.key = v_key
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

  -- The contact is registered against whichever person we ended up with —
  -- derived OR supplied by the caller. Registering only in the derived case
  -- left a hole: a caller passing person_id with an unregistered contact meant
  -- resolve_contact could never find it again, which is mode 1 all over again.
  -- ON CONFLICT DO NOTHING: if this key already belongs to another person we
  -- leave it alone. Under-registering is visible and correctable; fusing two
  -- people is silent and is not.
  if new.person_id is not null
     and new.contact_method in ('email','whatsapp','linkedin') then
    insert into public.person_contacts (person_id, owner_id, method, value, key)
    values (new.person_id, new.owner_id, new.contact_method, new.contact_value, v_key)
    on conflict (owner_id, method, key) do nothing;
  end if;

  -- LINKED USER. phone_key on BOTH sides — the shared normaliser, not string
  -- equality. Links ONLY when exactly one user matches: under-linking shows as
  -- "not on Trustnet" and is correctable, a wrong link silently routes one
  -- person's questions to another and nothing re-checks it.
  if new.linked_user_id is null then
    select count(*), (array_agg(u.id))[1] into v_n, v_user
      from public.users u
     where (new.contact_method = 'email'    and lower(u.email) = v_key)
        or (new.contact_method = 'whatsapp' and public.phone_key(u.phone) = v_key);
    if v_n = 1 then
      new.linked_user_id := v_user;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_member_identity on public.members;
create trigger trg_member_identity
  before insert or update on public.members
  for each row execute function public.member_identity();

-- ── 7 · the guarantee. Two memberships of one person in one circle stop being
--        a bug the app must avoid and become a write the database refuses. ──
create unique index if not exists members_person_circle_uniq
  on public.members (owner_id, circle_id, person_id)
  where person_id is not null;

-- ── 8 · verify, or abort.
--        LIMIT, STATED PLAINLY: this checks the DATA, not the trigger. Every
--        repair step above runs before trg_member_identity exists, so nothing
--        here exercises it — a broken trigger would pass this block. The
--        trigger's behaviour is covered by identity-trigger-sim, which drives
--        it against a real Postgres before this migration is ever deployed.
--        (That is how `min(uuid)` — a function Postgres does not have — was
--        caught in the first draft of this file.) ─────────────────────────
do $$
declare v_orphan integer; v_dup integer; v_app integer;
begin
  select count(*) into v_orphan from public.members
   where contact_key is not null and person_id is null
     and contact_method in ('email','whatsapp','linkedin');
  select count(*) into v_dup from (
    select 1 from public.members where person_id is not null
     group by owner_id, circle_id, person_id having count(*) > 1) t;
  select count(*) into v_app from public.members where contact_method = 'app';

  if v_orphan > 0 then raise exception 'ABORT: % member(s) with a contact still have no person', v_orphan; end if;
  if v_dup    > 0 then raise exception 'ABORT: % duplicate membership group(s) remain', v_dup; end if;
  if v_app    > 0 then raise exception 'ABORT: % row(s) still carry contact_method app', v_app; end if;

  raise notice 'OK — every contact has a person, no duplicate memberships, no app rows';
end $$;

commit;
