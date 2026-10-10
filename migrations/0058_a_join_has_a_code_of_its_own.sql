-- ============================================================================
-- 0058 · A JOIN HAS A CODE OF ITS OWN
--
-- Everyone invited to a circle holds the SAME invite token
-- (get_or_create_circle_link, 0055: one active token per circle). The codeless
-- join sent that shared token in "Join Trustnet: <token>", and the claim, the
-- polling and complete-join were all keyed on it. So the claim belonged to
-- whoever held the link, not to the one browser that started the join.
--
-- The fix is the shape sign-in already has (0052): the browser that taps
-- "Continue with WhatsApp" first mints a ONE-OFF code, here tied to the circle,
-- and sends THAT. The claim, claim_status and complete-join are keyed on the
-- one-off code; the circle is looked up from it server-side. The shared invite
-- token alone opens nothing that is in flight.
--
-- - signin_tokens gains invite_token: the circle invitation an attempt is for.
--   Null for a plain sign-in.
-- - mint_join_token(p_invite): anyone holding a LIVE invite may mint one, as
--   anyone may mint a sign-in token - the code is worthless until a message
--   from a real phone (signed by Meta, since 9f973a1) claims it.
-- - record_invite_claim accepts ONLY a live one-off code. A raw circle token
--   is now refused, which is what closes it.
--
-- ORDER: complete-join understood both kinds before this was applied (pushed
-- first); the client that mints these codes is pushed after it. Between the
-- two, a join started on an old page is refused once.
--
-- Run each numbered statement on its own. All are idempotent.
-- ============================================================================

-- 1 · which invitation an attempt is for (null: a plain sign-in)
alter table public.signin_tokens add column if not exists invite_token text;

-- 2 · mint a one-off code for joining a circle through a live invitation
create or replace function public.mint_join_token(p_invite text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token text;
begin
  if p_invite is null or not exists (
       select 1 from public.circle_invite_links
        where token = p_invite and active = true) then
    return null;
  end if;
  delete from public.signin_tokens
   where expires_at < now() - interval '1 day';
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.signin_tokens (token, invite_token) values (v_token, p_invite);
  return v_token;
end;
$function$;

-- 3 · callable from a browser that is not signed in, like mint_signin_token
revoke all on function public.mint_join_token(text) from public;

-- 4
grant execute on function public.mint_join_token(text) to anon, authenticated;

-- 5 · record_invite_claim takes ONLY a live one-off code. Otherwise 0056's
--     body: the name, the refresh of a repeated send, the finish pass.
create or replace function public.record_invite_claim(
  p_token text, p_phone text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link   record;
  v_signin record;
  v_name   text;
  v_kind   text;
  v_finish text;
  v_circle text;
begin
  select * into v_signin from public.signin_tokens
   where token = p_token and consumed_at is null and expires_at > now();
  if not found then
    -- A raw circle token lands here too, and that is the point of 0058.
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  -- The circle's name is read HERE, inside the invite branch. The first draft
  -- read v_link.circle_id in the return below, and for a plain sign-in v_link
  -- is never assigned: "record v_link is not assigned yet", on EVERY sign-in.
  -- A CASE does not protect it. Found by executing it in a rolled-back dry
  -- run, which is the only thing that finds this (CLAUDE.md, 0053).
  if v_signin.invite_token is not null then
    select * into v_link from public.circle_invite_links
     where token = v_signin.invite_token and active = true;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'invalid_token');
    end if;
    select name into v_circle from public.circles where id = v_link.circle_id;
    v_kind := 'invite';
  else
    v_kind := 'signin';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and v_name ~ '^\+?[0-9][0-9 ()\-]*$' then
    v_name := null;
  end if;
  v_name := left(v_name, 80);

  delete from public.invite_claims
   where token = p_token and consumed_at is null;

  v_finish := replace(gen_random_uuid()::text, '-', '');
  insert into public.invite_claims (token, claimed_phone, claimed_name, finish_secret)
  values (p_token, p_phone, v_name, v_finish);

  return jsonb_build_object('ok', true, 'kind', v_kind, 'finish', v_finish,
    'circle', v_circle);
end;
$function$;

-- 6 · the same grant 0052 and 0056 gave it
grant execute on function public.record_invite_claim(text, text, text) to service_role;
