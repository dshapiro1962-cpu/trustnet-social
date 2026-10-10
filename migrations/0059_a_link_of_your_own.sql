-- ============================================================================
-- 0059 · A LINK OF YOUR OWN
--
-- dan, 10 Oct 2026: an invited person taps the link in WhatsApp, fills in
-- their name and location, taps Sign in - and is in. "the user does not have
-- to do anything beyond the 3 steps", the same on iPhone and Android.
--
-- Until now the proof of who someone is was a WhatsApp message they SENT -
-- a fourth step, and a switch out of the browser and back. A personal link
-- carries that proof instead: one per invited person, made when the inviter
-- presses Invite and sent from the inviter's own WhatsApp to that person's
-- number. Tapping it is the proof, the same trust the answer links in
-- respond.html have always carried.
--
-- THE COST, said to dan before he chose it: a personal link that is
-- forwarded lets whoever opens it first become that person. And the number
-- the inviter typed is NOT written onto the new account as proven - users.phone
-- stays empty (0057 lets only the server set it) - because an inviter's typo
-- would otherwise pull the real owner of that number into this account at
-- their first WhatsApp sign-in.
--
-- The circle's shared link (/j/, 0058) is unchanged: it still asks for the
-- WhatsApp message, because a shared link cannot say who tapped it.
--
-- Run each numbered statement on its own. All are idempotent.
-- ============================================================================

-- 1 · one row per personal invitation
create table if not exists public.personal_invites (
  token       text primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  owner_id    uuid not null references public.users(id) on delete cascade,
  circle_id   uuid not null references public.circles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  used_at     timestamptz,
  used_by     uuid references public.users(id) on delete set null
);

-- 2 · nobody reads it from a browser: no policies, RLS on
alter table public.personal_invites enable row level security;

-- 3
create index if not exists personal_invites_member on public.personal_invites (member_id);

-- 4 · the inviter's app registers the link it made. The code is made in the
--     browser so WhatsApp can open with it before this round trip returns;
--     this only accepts a 32-hex code, for a member the caller owns.
create or replace function public.create_personal_invite(p_member_id uuid, p_token text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_m record;
begin
  if auth.uid() is null then return null; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into v_m from public.members
   where id = p_member_id and owner_id = auth.uid()
     and coalesce(is_external_source, false) = false;
  if not found then return null; end if;
  insert into public.personal_invites (token, member_id, owner_id, circle_id)
  values (p_token, v_m.id, v_m.owner_id, v_m.circle_id)
  on conflict (token) do nothing;
  -- A clash with somebody else's code returns nothing rather than theirs.
  if exists (select 1 from public.personal_invites where token = p_token and member_id = v_m.id) then
    return p_token;
  end if;
  return null;
end;
$function$;

-- 5
revoke all on function public.create_personal_invite(uuid, text) from public;

-- 6
grant execute on function public.create_personal_invite(uuid, text) to authenticated;

-- 7 · what the invited person's page may show: who asked, and the circle.
--     Never the name the inviter gave them, and never who else is in it.
create or replace function public.personal_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_i       record;
  v_inviter text;
  v_circle  text;
begin
  select * into v_i from public.personal_invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_i.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if v_i.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select name into v_circle from public.circles where id = v_i.circle_id;
  if v_circle is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select split_part(coalesce(nullif(btrim(name), ''), 'A friend'), ' ', 1) into v_inviter
    from public.users where id = v_i.owner_id;
  return jsonb_build_object('ok', true, 'inviter', coalesce(v_inviter, 'A friend'), 'circle', v_circle);
end;
$function$;

-- 8
revoke all on function public.personal_invite_preview(text) from public;

-- 9
grant execute on function public.personal_invite_preview(text) to anon, authenticated;

-- 10 · ONE place that makes "this account is that person" true, for a new
--      account (redeem-invite, as service_role) and an existing one
--      (accept_personal_invite). Links the member row, and the inviter's other
--      rows for the same person, spends every live link for that member, and
--      tells the inviter.
create or replace function public.redeem_personal_invite(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_i    record;
  v_m    record;
  v_c    record;
  v_name text;
begin
  select * into v_i from public.personal_invites where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_i.used_at is not null then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if v_i.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_i.owner_id = p_user_id then return jsonb_build_object('ok', false, 'reason', 'own_circle'); end if;
  select * into v_m from public.members where id = v_i.member_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_m.linked_user_id is not null and v_m.linked_user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'reason', 'already_joined');
  end if;
  select * into v_c from public.circles where id = v_i.circle_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.members set linked_user_id = p_user_id
   where id = v_m.id
      or (owner_id = v_i.owner_id and person_id is not null
          and person_id = v_m.person_id and linked_user_id is null);

  update public.personal_invites set used_at = now(), used_by = p_user_id
   where member_id = v_m.id and used_at is null;

  select coalesce(nullif(btrim(name), ''), v_m.name) into v_name from public.users where id = p_user_id;
  v_name := coalesce(v_name, v_m.name);
  insert into public.notifications (user_id, type, title, body, circle_id, actor_name)
  values (v_i.owner_id, 'invite_accepted', v_name || ' joined your ' || v_c.name || ' circle',
          'They joined with your invitation and can now receive your questions.', v_c.id, v_name);

  return jsonb_build_object('ok', true, 'circle', v_c.name, 'member_id', v_m.id);
end;
$function$;

-- 11 · only the server calls it directly
revoke all on function public.redeem_personal_invite(text, uuid) from public;

-- 12
revoke all on function public.redeem_personal_invite(text, uuid) from anon, authenticated;

-- 13
grant execute on function public.redeem_personal_invite(text, uuid) to service_role;

-- 14 · someone already signed in taps their link: same linking, as themselves
create or replace function public.accept_personal_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  return public.redeem_personal_invite(p_token, auth.uid());
end;
$function$;

-- 15
revoke all on function public.accept_personal_invite(text) from public;

-- 16
grant execute on function public.accept_personal_invite(text) to authenticated;
