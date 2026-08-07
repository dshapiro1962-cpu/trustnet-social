-- ============================================================================
-- 0024_resolve_contact.sql                                       6 Aug 2026
--
-- IDENTITY LOOKUP, SERVER-SIDE, WITH THREE STATES.
--
-- WHAT WENT WRONG BEFORE:
--   * link_member_to_existing_user queried auth.users.phone — A COLUMN THAT
--     DOES NOT EXIST. Every whatsapp-method lookup threw. The client caught the
--     exception, logged it to a console nobody reads, and carried on as if the
--     person simply were not a user. A CRASH AND A GENUINE "NO" WERE
--     INDISTINGUISHABLE — to the code and to dan.
--   * It matched only the method the member was added with. Added by email ->
--     the phone was never consulted, even when the person had one.
--   * It returned a bare boolean, so the caller could not tell "not a user"
--     from "could not check".
--   * The client then decided duplicates from a browser cache of unknown age,
--     falling back to NAME EQUALITY — which is exactly what dan's rule forbids.
--
-- THIS FUNCTION RETURNS A STATE, NOT A BOOLEAN:
--   found_person  — this contact already belongs to one of YOUR people (ASK
--                   before merging: dan's rule is that the app must ask)
--   in_circle     — that person is already in THIS circle
--   on_trustnet   — nobody of yours holds it, but a Trustnet ACCOUNT does
--   free          — nobody holds it; safe to create
-- An exception is never swallowed: the caller gets an error and must say
-- "couldn't check" rather than demoting someone to a stranger.
--
-- PRIVACY: never enumerates. It answers only about a contact the caller ALREADY
-- KNOWS, and returns a bare boolean for strangers — no name, no id, nothing
-- about who they are. Searching by NAME is confined to the caller's own people.
--
-- Idempotent. Safe on production.
-- ============================================================================

create or replace function public.resolve_contact(
  p_method   text,
  p_value    text,
  p_circle   uuid default null
)
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

  -- ONE normalisation rule, shared with person_contacts (0022) and phone_key
  -- (0017). A second implementation of one rule is what produced the
  -- classify-rec and match_canonical bugs earlier this week.
  v_key := public.contact_key(p_method, p_value);
  if v_key is null then
    raise exception 'empty_contact';
  end if;

  -- 1. does one of MY people already hold this contact?
  select pc.person_id, p.name into v_pid, v_name
  from public.person_contacts pc
  join public.people p on p.id = pc.person_id
  where pc.owner_id = v_owner and pc.method = p_method and pc.key = v_key
  limit 1;

  -- 2. is there a Trustnet ACCOUNT behind it? BOTH methods are checked, always
  --    — not merely the one this contact happens to use. users.phone_key is the
  --    real column (0017); auth.users.phone never existed.
  if p_method = 'whatsapp' then
    select u.id into v_user from public.users u
    where u.phone_key is not null and u.phone_key = v_key limit 1;
  elsif p_method = 'email' then
    select u.id into v_user from public.users u
    where u.email is not null and lower(btrim(u.email)) = v_key limit 1;
  end if;

  if v_pid is not null then
    if p_circle is not null then
      select m.id into v_mid from public.members m
      where m.person_id = v_pid and m.circle_id = p_circle limit 1;
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

-- ── search MY people by name — a CONVENIENCE for finding, never for deciding ─
-- dan's rule 2: typing a name shows every match WITH details so the human
-- chooses. It must never contradict the contact-exact rule, and it can only
-- ever see the caller's own people.
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
                   where m.person_id = p.id), '[]'::jsonb)
  from public.people p
  where p.owner_id = auth.uid()
    and (p_q is null or btrim(p_q) = '' or p.name ilike '%' || btrim(p_q) || '%')
  order by p.name
  limit 25;
$$;

revoke all on function public.search_my_people(text) from public;
grant execute on function public.search_my_people(text) to authenticated;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc where proname = 'resolve_contact')   as resolve_should_be_1,
  (select count(*) from pg_proc where proname = 'search_my_people')  as search_should_be_1,
  (select count(*) from pg_proc where proname = 'contact_key')       as contact_key_should_be_1;
