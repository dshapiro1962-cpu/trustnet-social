-- 0052 · SIGNING IN IS SENDING A MESSAGE
--
-- WHAT WAS BROKEN, measured 22 Sep 2026: the 6-digit WhatsApp code had NEVER
-- worked. Nine codes requested since 10 August, none ever used, and not one
-- wrong-code attempt recorded — nobody ever typed a code, because nobody ever
-- received one. wa-signin sends a FREE-FORM text message, and WhatsApp only
-- permits those within 24 hours of that person messaging the business. Every
-- other WhatsApp message this product sends is an approved template; that one
-- was the exception, and it was the exception that carried sign-in.
--
-- The screen said "We sent a 6-digit code to +972…" every time, because the
-- server returned `delivered: false` and the client threw the value away.
--
-- dan, 22 Sep: "no digit path discard it", and sign-in and sign-up are one act.
--
-- WHAT REPLACES IT is machinery this app already has and trusts. The codeless
-- invite join: one button, WhatsApp opens with "Join Trustnet: <token>" already
-- written, you press send. The message arrives FROM YOUR NUMBER — WhatsApp
-- guarantees that — so sending IS the verification. The webhook only RECORDS a
-- claim, because it cannot verify Meta's signature; the browser tab holding the
-- token is what turns a claim into a session (complete-join). A forwarded
-- message fails safely: it sends from the forwarder's number and signs THEM in
-- as themselves.
--
-- The only reason that was not the sign-in already is that record_invite_claim
-- would accept a circle invite token and nothing else. This adds the second
-- kind of token, and changes nothing about the first.
--
-- Each statement is numbered, idempotent and independent: the SQL editor sends
-- every statement on its own connection and there is no shared transaction.

-- ── 1 · a token that means "someone is signing in", and nothing more ───────
create table if not exists public.signin_tokens (
  token       text primary key,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

-- ── 2 · nobody reads this table from a browser. No policies, RLS on: the
--        functions below are SECURITY DEFINER and the webhook is service_role.
alter table public.signin_tokens enable row level security;

create index if not exists idx_signin_tokens_live
  on public.signin_tokens (expires_at) where consumed_at is null;

-- ── 3 · minting one. Anon-callable, because whoever is signing in is by
--        definition signed out. A token is 32 random characters and means
--        nothing on its own: it is useful only to the browser that holds it,
--        and only once somebody sends it from their own WhatsApp.
create or replace function public.mint_signin_token()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_token text;
begin
  -- Housekeeping while we are here: a dead token has no purpose and this is
  -- the only regular traffic this table sees.
  delete from public.signin_tokens
   where expires_at < now() - interval '1 day';

  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.signin_tokens (token) values (v_token);
  return v_token;
end;
$$;

revoke all on function public.mint_signin_token() from public;
grant execute on function public.mint_signin_token() to anon, authenticated;

-- ── 4 · the webhook's claim now accepts either kind of token ───────────────
-- Replaced in place, never dropped: there is no moment when it does not exist.
-- The circle branch is untouched, character for character, because an invite
-- that works today must work identically tomorrow.
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
begin
  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;

  if not found then
    -- THE SECOND KIND (0052). Not an invitation to a circle: somebody signing
    -- in. Live only, and only once — an expired or spent token is as good as
    -- no token at all.
    select * into v_signin from public.signin_tokens
     where token = p_token and consumed_at is null and expires_at > now();
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'invalid_token');
    end if;
    v_kind := 'signin';
  else
    v_kind := 'invite';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and v_name ~ '^\+?[0-9][0-9 ()\-]*$' then
    v_name := null;
  end if;
  v_name := left(v_name, 80);

  -- A repeated send must not fail; refresh the existing live claim instead.
  delete from public.invite_claims
   where token = p_token and consumed_at is null;

  insert into public.invite_claims (token, claimed_phone, claimed_name)
  values (p_token, p_phone, v_name);

  return jsonb_build_object('ok', true, 'kind', v_kind,
    'circle', case when v_kind = 'invite'
                then (select name from public.circles where id = v_link.circle_id)
                else null end);
end;
$function$;

grant execute on function public.record_invite_claim(text, text, text) to service_role;

-- ── 5 · spending a sign-in token. complete-join calls this as service_role
--        once it has minted the session, so a token cannot be used twice.
create or replace function public.consume_signin_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  update public.signin_tokens
     set consumed_at = now()
   where token = p_token and consumed_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.consume_signin_token(text) from public;
revoke all on function public.consume_signin_token(text) from anon;
revoke all on function public.consume_signin_token(text) from authenticated;
grant execute on function public.consume_signin_token(text) to service_role;

-- ── 6 · is this token a live sign-in? complete-join asks before it decides
--        there is no circle to join.
create or replace function public.is_live_signin_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.signin_tokens
     where token = p_token and consumed_at is null and expires_at > now());
$$;

revoke all on function public.is_live_signin_token(text) from public;
revoke all on function public.is_live_signin_token(text) from anon;
revoke all on function public.is_live_signin_token(text) from authenticated;
grant execute on function public.is_live_signin_token(text) to service_role;

-- ── 7 · verify, or say why not ─────────────────────────────────────────────
do $$
declare
  v_token text;
  v_rec   jsonb;
begin
  if to_regclass('public.signin_tokens') is null then
    raise exception '0052: signin_tokens was not created';
  end if;
  -- Mint one, claim it as if the webhook had, and check both branches answer.
  v_token := public.mint_signin_token();
  v_rec := public.record_invite_claim(v_token, '+972500000000', null);
  if (v_rec->>'ok')::boolean is not true or v_rec->>'kind' <> 'signin' then
    raise exception '0052: a live sign-in token was not accepted: %', v_rec;
  end if;
  if public.is_live_signin_token(v_token) is not true then
    raise exception '0052: a live token did not read as live';
  end if;
  if public.consume_signin_token(v_token) is not true then
    raise exception '0052: a live token could not be spent';
  end if;
  if public.is_live_signin_token(v_token) is not false then
    raise exception '0052: a spent token still reads as live';
  end if;
  if (public.record_invite_claim(v_token, '+972500000000', null)->>'ok')::boolean is not false then
    raise exception '0052: a spent token was accepted for a second claim';
  end if;
  -- Leave nothing behind: the probe's own rows go.
  delete from public.invite_claims where token = v_token;
  delete from public.signin_tokens where token = v_token;
  raise notice '0052 ok - signing in is sending a message';
end $$;
