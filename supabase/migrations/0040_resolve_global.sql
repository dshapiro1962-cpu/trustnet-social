-- ═══════════════════════════════════════════════════════════════════════════
-- 0040 — resolve_contact and search_my_people under a shared person model
--
-- WHY 0038 BREAKS THESE
--   Both are SECURITY DEFINER, so they bypass RLS and must scope themselves.
--   Both scope by people.owner_id / person_contacts.owner_id — which 0038 makes
--   meaningless. Left alone:
--
--   resolve_contact would report `free` for a contact that plainly exists,
--   the client would then create the person, and the new global unique index
--   would reject it:
--       ERROR: duplicate key value violates unique constraint
--              "person_contacts_identity_uniq"
--   The function would be telling the client to do what the database forbids.
--
--   search_my_people would return NOTHING for most of the caller's own people,
--   because after the merge those rows carry another owner's owner_id.
--
-- A CORRECTION TO SOMETHING I SAID EARLIER
--   I claimed twice that `pc.method = p_method` was a bug — that adding someone
--   by email when they are registered by phone wrongly mints a second person.
--   That is WRONG, and it is wrong in the direction of the rule: a phone key
--   and an email key are different keys, so they never match, and under dan's
--   rule they SHOULD NOT. A phone and an email become one person only when the
--   human joins and attaches both to their own account. Nothing infers it.
--   The method filter is redundant, not harmful, and it is kept as a guard
--   against a pathological key collision.
--
-- HOW TO RUN THIS
--   Each statement on its own connection — the Supabase editor sends them
--   separately (proven 20 Aug). No begin/commit. Both statements are
--   `create or replace`, so both are idempotent. RUN 0038 AND 0039 FIRST.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · resolve_contact ─────────────────────────────────────────────────────
create or replace function public.resolve_contact(
  p_method text, p_value text, p_circle uuid default null)
returns table (
  state          text,
  person_id      uuid,
  person_name    text,
  membership_id  uuid,
  on_trustnet    boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid := auth.uid();
  v_key   text;
  v_pid   uuid;
  v_name  text;
  v_mid   uuid;
  v_user  uuid;
begin
  if v_owner is null then
    raise exception 'not_authenticated';
  end if;
  if p_method is null or p_method not in ('email','whatsapp','linkedin') then
    raise exception 'bad_method: %', coalesce(p_method, 'null');
  end if;

  v_key := public.contact_key(p_method, p_value);
  if v_key is null then
    raise exception 'empty_contact';
  end if;

  -- 1. WHO IS THIS? Identity is global now: one contact, one person, across
  --    the whole app. No owner filter — that filter was what made the same
  --    phone number a different person in every address book.
  select pc.person_id, p.name into v_pid, v_name
  from public.person_contacts pc
  join public.people p on p.id = pc.person_id
  where pc.method = p_method and pc.key = v_key
  limit 1;

  -- 2. DO *I* KNOW THEM? Identity being shared does not make relationships
  --    shared. If the caller holds no member row for this person, then from
  --    the caller's point of view this contact is new — and reporting
  --    'found_person' would both confuse them and hand them another owner's
  --    label for a stranger. The person is still REUSED on save: the identity
  --    trigger from 0036 finds it by key and never mints a second one. The
  --    caller simply is not told that someone else already knows them.
  --
  --    AND THE NAME COMES FROM THE CALLER'S OWN MEMBER ROW. people.name is
  --    whatever the surviving person row happened to be called, which after
  --    0038 is whichever owner got there first. Returning it would show one
  --    owner another owner's label — and dan's rule is that each owner keeps
  --    their own. Caught by testing as two users, not by reading.
  if v_pid is not null then
    select m.name into v_name
      from public.members m
     where m.person_id = v_pid and m.owner_id = v_owner
     order by m.created_at
     limit 1;
    if v_name is null then
      v_pid := null;          -- no member row: this contact is new to me
    end if;
  end if;

  -- 3. is there a Trustnet ACCOUNT behind it? users.phone_key is the real
  --    column (0017); auth.users.phone never existed. Synthetic WhatsApp
  --    addresses are auth plumbing and are never an identity.
  if p_method = 'whatsapp' then
    select u.id into v_user from public.users u
    where u.phone_key is not null and u.phone_key = v_key limit 1;
  elsif p_method = 'email' then
    select u.id into v_user from public.users u
    where u.email is not null and lower(btrim(u.email)) = v_key
      and u.email not like '%@wa.trustnet.local' limit 1;
  end if;

  if v_pid is not null then
    if p_circle is not null then
      -- owner filter added: this function is DEFINER and bypasses RLS, so it
      -- must not reach into another owner's membership even by accident.
      select m.id into v_mid from public.members m
      where m.person_id = v_pid and m.circle_id = p_circle
        and m.owner_id = v_owner
      limit 1;
    end if;
    return query select
      case when v_mid is not null then 'in_circle' else 'found_person' end,
      v_pid, v_name, v_mid, (v_user is not null);
    return;
  end if;

  return query select
    case when v_user is not null then 'on_trustnet' else 'free' end,
    null::uuid, null::text, null::uuid, (v_user is not null);
end;
$$;

revoke all on function public.resolve_contact(text, text, uuid) from public;
grant execute on function public.resolve_contact(text, text, uuid) to authenticated;

-- CHECK 1 - adding a contact another owner already knows must NOT say
-- 'found_person', and must not fail:
-- select * from public.resolve_contact('whatsapp', '+972505543402', null);


-- ── 2 · search_my_people ────────────────────────────────────────────────────
-- TWO faults after 0038, one of them a leak the merge CREATES:
--
--   a) `where p.owner_id = auth.uid()` — after the merge most of the caller's
--      own people carry another owner's owner_id, so the caller's own people
--      vanish from their own search.
--
--   b) the circles sub-select joins members on person_id with NO owner filter.
--      Before the merge that was harmless: a person row belonged to one owner,
--      so only that owner's members could match. After the merge one person is
--      shared, and this would list OTHER OWNERS' CIRCLE NAMES back to the
--      caller. Identity is shared; circles, labels and trust notes are not.
create or replace function public.search_my_people(p_q text)
returns table (
  person_id   uuid,
  name        text,
  on_trustnet boolean,
  contacts    jsonb,
  circles     jsonb
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name,
         (p.linked_user_id is not null) as on_trustnet,
         coalesce((select jsonb_agg(jsonb_build_object('method', pc.method, 'value', pc.value)
                                    order by pc.method)
                   from public.person_contacts pc where pc.person_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                                    order by c.name)
                   from public.members m join public.circles c on c.id = m.circle_id
                   where m.person_id = p.id
                     and m.owner_id = auth.uid()), '[]'::jsonb)   -- (b)
  from public.people p
  where exists (select 1 from public.members m2                    -- (a)
                 where m2.person_id = p.id and m2.owner_id = auth.uid())
    and (p_q is null or btrim(p_q) = '' or p.name ilike '%' || btrim(p_q) || '%')
  order by p.name
  limit 25;
$$;

revoke all on function public.search_my_people(text) from public;
grant execute on function public.search_my_people(text) to authenticated;

-- CHECK 2 - must return the caller's own people, and only the caller's circles
-- select * from public.search_my_people(null);


-- ── 3 · verification ────────────────────────────────────────────────────────
-- select proname, prosecdef from pg_proc
--  where proname in ('resolve_contact','search_my_people') order by proname;
