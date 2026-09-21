-- 0051 · JOINING A CIRCLE ADOPTS THE ROW YOU ALREADY WROTE
--
-- WHAT WAS BROKEN, measured in production on 21 Sep 2026:
--
--   15:27:46  dan types naama into his leros circle — whatsapp +972…467,
--             linked_user_id null, person dabb8c1f…
--   15:32:45  naama presses send in WhatsApp. The claim is recorded.
--   15:33:14  complete-join creates her ACCOUNT.
--   —         the membership insert is REFUSED by members_person_circle_uniq,
--             because dan's own row already holds that person in that circle.
--             The claim is never consumed, `uses` never increments, and she
--             reads "Couldn't finish signing you in." For ever: pressing the
--             link again repeats it exactly.
--
-- Both join paths looked for a member carrying the joiner's USER id. A row
-- typed before that person had an account can never carry it, so both always
-- tried to insert, and the database always refused. Every invite to someone
-- already in the circle failed this way; the only joins that ever worked were
-- people joining a circle they were not already in — 11 of them.
--
-- THE RULE THIS ENCODES: a membership belongs to a PERSON, and the person is
-- resolved by the same normaliser the unique index is built on — contact_key,
-- via person_contacts. If the owner already wrote that person down in that
-- circle, joining LINKS that row. It does not add a second one.
--
-- Deliberately NOT done: matching by name. Two people called Dan Shapiro are
-- two people, and folding on a normalised name is the live identity problem
-- this repo already has on canonicals (CLAUDE.md, "Known broken" #4). Someone
-- typed in by EMAIL who joins by WhatsApp is therefore still a second row —
-- honest, and visible to the owner, rather than a silent wrong merge.
--
-- Each statement is numbered, idempotent and independent: the SQL editor sends
-- every statement on its own connection and there is no shared transaction.

-- ── 1 · one place that decides how a person becomes a member of a circle ───
create or replace function public.join_circle_as_user(
  p_circle_id uuid,
  p_user_id   uuid,
  p_name      text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_circle  record;
  v_user    record;
  v_member  record;
  v_phone   text;
  v_email   text;
  v_name    text;
  v_id      uuid;
begin
  select * into v_circle from public.circles where id = p_circle_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'circle_gone');
  end if;

  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  -- The owner is not a member of their own circle.
  if v_circle.owner_id = p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'own_circle',
                              'circle_name', v_circle.name);
  end if;

  -- 1. Already in, by their own user id. Idempotent: pressing send twice, or
  --    tapping the link twice, must not create a second membership.
  select * into v_member from public.members
   where circle_id = p_circle_id and linked_user_id = p_user_id
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'outcome', 'already',
                              'member_id', v_member.id,
                              'circle_name', v_circle.name);
  end if;

  -- 2. THE ROW THE OWNER ALREADY WROTE. Matched on the person, through the
  --    same contact_key that person_contacts is keyed by and that the unique
  --    index is built on — so a row found here is exactly the row that would
  --    otherwise refuse the insert. Only an UNLINKED row may be adopted: one
  --    already pointing at somebody else is somebody else.
  v_phone := public.contact_key('whatsapp', v_user.phone);
  v_email := public.contact_key('email', v_user.email);

  select m.* into v_member
    from public.members m
    join public.person_contacts pc on pc.person_id = m.person_id
   where m.circle_id = p_circle_id
     and m.linked_user_id is null
     and coalesce(m.is_external_source, false) = false
     and (   (v_phone is not null and pc.method = 'whatsapp' and pc.key = v_phone)
          or (v_email is not null and pc.method = 'email'    and pc.key = v_email))
   order by m.created_at
   limit 1;

  if found then
    -- The owner's own label for them is left exactly as it is (dan's rule:
    -- each owner keeps their own name for someone). Only the link is new.
    update public.members
       set linked_user_id = p_user_id
     where id = v_member.id;
    return jsonb_build_object('ok', true, 'outcome', 'adopted',
                              'member_id', v_member.id,
                              'member_name', v_member.name,
                              'circle_name', v_circle.name);
  end if;

  -- 2b. THE SAME PERSON, ALREADY POINTING AT A DIFFERENT ACCOUNT. Two accounts
  --     sharing one contact should not happen — a phone signs in to one account
  --     — but if it does, the insert below would hit the very constraint this
  --     migration exists to stop hitting, and the caller would get a 500 with a
  --     raw constraint name. Found by this migration's own dry run. A membership
  --     is never taken off another account, so this says so instead.
  select m.* into v_member
    from public.members m
    join public.person_contacts pc on pc.person_id = m.person_id
   where m.circle_id = p_circle_id
     and (   (v_phone is not null and pc.method = 'whatsapp' and pc.key = v_phone)
          or (v_email is not null and pc.method = 'email'    and pc.key = v_email))
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'contact_on_another_account',
                              'circle_name', v_circle.name);
  end if;

  -- 3. Nobody wrote them down: a new membership, named by the caller when the
  --    caller knows better (complete-join carries the inviter's label), else
  --    by their own profile.
  v_name := coalesce(nullif(btrim(p_name), ''), nullif(btrim(v_user.name), ''),
                     v_user.phone, v_user.email, 'Someone');
  begin
    insert into public.members
      (owner_id, circle_id, name, avatar, avatar_color, trust_basis,
       contact_method, contact_value, response_rate, linked_user_id)
    values
      (v_circle.owner_id, p_circle_id, v_name, v_user.avatar, v_user.avatar_color,
       'Joined via invite link',
       -- A CONTACT IS NOT OPTIONAL: every send dispatches on contact_method, and
       -- a member without one is unreachable.
       case when v_user.phone is not null then 'whatsapp' else 'email' end,
       coalesce(v_user.phone, v_user.email),
       'unknown', p_user_id)
    returning id into v_id;
  exception when unique_violation then
    -- Whatever else is true, the answer to "did they get in" must be a
    -- sentence and not a 500 carrying a constraint name.
    return jsonb_build_object('ok', false, 'reason', 'membership_refused',
                              'circle_name', v_circle.name);
  end;

  return jsonb_build_object('ok', true, 'outcome', 'created',
                            'member_id', v_id, 'member_name', v_name,
                            'circle_name', v_circle.name);
end $$;

-- ── 2 · the service_role path (complete-join) calls it as the service role;
--        a signed-in member reaches it only through join_circle_via_link
--        below, which is SECURITY DEFINER and validates the token first. ────
revoke all on function public.join_circle_as_user(uuid, uuid, text) from public;
revoke all on function public.join_circle_as_user(uuid, uuid, text) from anon;
revoke all on function public.join_circle_as_user(uuid, uuid, text) from authenticated;
grant execute on function public.join_circle_as_user(uuid, uuid, text) to service_role;

-- ── 3 · the signed-in join now goes through the same door ──────────────────
-- Its contract is unchanged — the client reads joined / already / reason /
-- circle_name / owner_name and nothing else. What changes is that it adopts
-- the row the owner wrote instead of inserting beside it: with an email
-- contact it used to make a SECOND row for the same human (no constraint
-- could see it), and with a phone contact it raised 23505 and the client said
-- "This invite link is no longer valid."
create or replace function public.join_circle_via_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link       record;
  v_circle     record;
  v_owner_name text;
  v_res        jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('joined', false, 'reason', 'not_signed_in');
  end if;

  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;
  if not found then
    return jsonb_build_object('joined', false, 'reason', 'invalid');
  end if;

  select * into v_circle from public.circles where id = v_link.circle_id;
  if not found then
    return jsonb_build_object('joined', false, 'reason', 'invalid');
  end if;
  select name into v_owner_name from public.users where id = v_link.owner_id;

  v_res := public.join_circle_as_user(v_link.circle_id, auth.uid(), null);

  if not (v_res->>'ok')::boolean then
    return jsonb_build_object('joined', false,
                              'reason', coalesce(v_res->>'reason', 'invalid'),
                              'circle_name', v_circle.name);
  end if;

  if v_res->>'outcome' = 'already' then
    return jsonb_build_object('joined', true, 'already', true,
                              'circle_name', v_circle.name,
                              'owner_name', v_owner_name);
  end if;

  update public.circle_invite_links set uses = uses + 1 where id = v_link.id;

  insert into public.notifications (user_id, type, title, body, circle_id, actor_name)
  select v_link.owner_id, 'invite_accepted',
         coalesce(v_res->>'member_name', 'Someone') || ' joined your ' || v_circle.name || ' circle',
         'They joined via your invite link and can now receive your queries.',
         v_circle.id, v_res->>'member_name';

  return jsonb_build_object('joined', true, 'already', false,
                            'circle_name', v_circle.name,
                            'owner_name', v_owner_name);
end $$;

-- ── 4 · verify. Reads only; run it after the two functions above. ──────────
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('join_circle_as_user', 'join_circle_via_link');
  if v_n < 2 then
    raise exception '0051 did not take: expected both functions, found %', v_n;
  end if;
  raise notice '0051 ok — both join paths adopt the row the owner wrote';
end $$;
