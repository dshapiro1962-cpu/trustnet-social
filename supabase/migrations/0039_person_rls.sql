-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — a person is readable if you hold a member row pointing at them
--
-- WHY 0038 IS INCOMPLETE WITHOUT THIS
--   0038 merges 42 person rows into 26. A merged person keeps ONE owner_id,
--   but every owner who held that contact still has a member row pointing at
--   it. Under 0022's policy — `owner_id = auth.uid()` — all the other owners
--   get nothing back, and their screens show a member with NO CONTACT.
--   That breaks dan's rule that the contact is always one tap away, for
--   everyone except whichever owner happened to be first.
--
-- THE NEW RULE
--   You may read a person if you hold a member row pointing at them. You added
--   them; you already typed their contact in. So this exposes nothing you did
--   not already have.
--
--   WHY THAT IS SAFE, AND WHEN IT STOPS BEING SAFE: every person in this app
--   arrived because an owner entered their contact. There is no forwarding
--   feature — checked in the code, not assumed. IF A FEATURE EVER LETS A
--   PERSON APPEAR WITHOUT AN OWNER ENTERING THEM — a forwarded query, a
--   friend-of-a-friend suggestion carrying a contact, an import — THIS POLICY
--   LEAKS THAT CONTACT AND MUST BE REVISITED FIRST.
--
--   The `owner_id = auth.uid()` arm is kept as well, and it is not vestigial:
--   the client inserts a person and immediately reads it back with
--   `.select('id').single()`. At that instant no member row points at it yet,
--   so without this arm the RETURNING clause finds nothing and add-member
--   fails. It also covers a person whose member row was deleted.
--
-- WHAT IS NOT SHARED
--   Labels. dan's "Itamar" and another owner's "Itamar Shapiro" live on
--   members.name, which is untouched and already per-owner. Circles, trust
--   notes and history stay private. Only the identity is shared.
--
-- HOW TO RUN THIS
--   The Supabase SQL editor sends EACH STATEMENT ON ITS OWN CONNECTION —
--   proven 20 Aug. No begin/commit, no temp tables. Every statement here is
--   idempotent. Run them one at a time, in order. RUN 0038 FIRST.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · replace the people policy ───────────────────────────────────────────
drop policy if exists people_owner on public.people;

drop policy if exists people_readable on public.people;
create policy people_readable on public.people
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.members m
                where m.person_id = people.id and m.owner_id = auth.uid())
  );

-- Writes stay with the owner. The identity trigger from 0036 is SECURITY
-- DEFINER and bypasses RLS, so it can still create and reuse people on behalf
-- of any writer — which is the point of it being the single writer.
drop policy if exists people_insert on public.people;
create policy people_insert on public.people
  for insert with check (owner_id = auth.uid());

drop policy if exists people_update on public.people;
create policy people_update on public.people
  for update using (
    owner_id = auth.uid()
    or exists (select 1 from public.members m
                where m.person_id = people.id and m.owner_id = auth.uid())
  );

drop policy if exists people_delete on public.people;
create policy people_delete on public.people
  for delete using (owner_id = auth.uid());

-- CHECK 1 - expect people_readable, people_insert, people_update, people_delete
-- select policyname, cmd from pg_policies
--  where tablename = 'people' order by policyname;


-- ── 2 · replace the person_contacts policy ──────────────────────────────────
-- Same shape. This is the one that actually carries the contact, so it is the
-- one that decides whether the other owners see a phone number or a blank.
drop policy if exists person_contacts_owner on public.person_contacts;

drop policy if exists person_contacts_readable on public.person_contacts;
create policy person_contacts_readable on public.person_contacts
  for select using (
    owner_id = auth.uid()
    or exists (select 1 from public.members m
                where m.person_id = person_contacts.person_id
                  and m.owner_id = auth.uid())
  );

drop policy if exists person_contacts_insert on public.person_contacts;
create policy person_contacts_insert on public.person_contacts
  for insert with check (owner_id = auth.uid());

-- Update and delete are deliberately NOT widened to member-holders. Changing
-- or removing a contact changes WHO A PERSON IS for every owner who holds
-- them. Only the owner who introduced it may do that, and the trigger — as
-- DEFINER — handles the rest. Widening this later is a decision, not a detail.
drop policy if exists person_contacts_update on public.person_contacts;
create policy person_contacts_update on public.person_contacts
  for update using (owner_id = auth.uid());

drop policy if exists person_contacts_delete on public.person_contacts;
create policy person_contacts_delete on public.person_contacts
  for delete using (owner_id = auth.uid());

-- CHECK 2
-- select policyname, cmd from pg_policies
--  where tablename = 'person_contacts' order by policyname;


-- ── 3 · indexes the new policies depend on ──────────────────────────────────
-- Both policies run `exists (select 1 from members where person_id = ...)` on
-- every row read. idx_members_person exists from 0022; this adds the owner to
-- it so the check is a single index probe rather than a scan per person.
create index if not exists idx_members_person_owner
  on public.members (person_id, owner_id);

-- CHECK 3
-- select indexname from pg_indexes where tablename='members'
--  and indexname='idx_members_person_owner';


-- ── 4 · verification ────────────────────────────────────────────────────────
-- select tablename, policyname, cmd from pg_policies
--  where tablename in ('people','person_contacts') order by tablename, cmd;
--
-- Expect 4 policies on each. If people_owner or person_contacts_owner still
-- appear, step 1 or 2 did not run — and since there is no transaction here,
-- that is entirely possible. Re-run them.
