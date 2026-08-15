-- ============================================================================
-- 0033_invite_claims.sql                                        15 Aug 2026
--
-- CODELESS JOIN OVER WHATSAPP.
--
-- yuval tapped a WhatsApp invite and got a login form asking for a code he was
-- never sent. naama got the code, twice, and it worked — but dan's verdict was
-- that the code "complicates things too much, will scare users away, too many
-- windows to shift through". He is right: read a code in WhatsApp, remember it,
-- switch back, type it.
--
-- INSTEAD: she taps ONE button, WhatsApp opens with the message already
-- written, she presses send. That is it. The message reaches the Trustnet
-- number FROM HER PHONE NUMBER — WhatsApp guarantees that, and she cannot send
-- from someone else's — so the act of sending IS the verification. No digits
-- appear anywhere.
-- A FORWARDED INVITE FAILS SAFELY: her husband's tap sends from HIS number, so
-- he would join as himself, never as her. That is what the code protected
-- against, achieved without one.
--
-- ── WHY THE WEBHOOK ONLY RECORDS A CLAIM ────────────────────────────────────
-- THE WEBHOOK DOES NOT VERIFY META'S SIGNATURE. No x-hub-signature-256, no
-- app-secret HMAC. Anyone who knows the URL can post a forged message claiming
-- to be from any number. Today the damage is a junk item in someone's library.
-- IF THE WEBHOOK COULD CREATE ACCOUNTS AND GRANT MEMBERSHIPS, ONE FORGED
-- REQUEST WOULD LET ANYONE BECOME ANYONE and join any circle whose token they
-- hold.
-- So the trust is inverted: the webhook RECORDS that a phone claimed a token
-- and does nothing else. Only the browser tab that actually opened the invite —
-- the one holding the token — can complete it. A forged claim achieves nothing.
-- (Signature verification is worth adding on its own; deliberately not
-- smuggled into this change.)
-- ============================================================================

create table if not exists public.invite_claims (
  id            uuid primary key default gen_random_uuid(),
  token         text not null,
  claimed_phone text not null,
  phone_key     text generated always as (phone_key(claimed_phone)) stored,
  claimed_at    timestamptz not null default now(),
  consumed_at   timestamptz,
  -- Ten minutes: long enough for a slow hand-off, short enough that a claim
  -- cannot sit around waiting to be picked up by someone else later.
  expires_at    timestamptz not null default now() + interval '10 minutes'
);

create index if not exists idx_invite_claims_token
  on public.invite_claims (token) where consumed_at is null;

-- One LIVE claim per token: a second tap while the first is unconsumed must
-- not create a competing row. Two people tapping the same link is a real case.
create unique index if not exists invite_claims_one_live
  on public.invite_claims (token) where consumed_at is null;

alter table public.invite_claims enable row level security;
-- No policies: the table is reachable ONLY through the functions below, both of
-- which are security definer. Nothing may read it directly, so a claimed phone
-- number is never exposed to a client.

-- ── the browser asks: has anyone claimed my token yet? ──────────────────────
-- Anon-callable, because the visitor has not signed in — that is the entire
-- point. It answers only about a token the caller ALREADY HOLDS, and a token is
-- 32 random characters, so this cannot be used to discover anything.
create or replace function public.claim_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_claim record;
begin
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('claimed', false);
  end if;
  select * into v_claim from public.invite_claims
   where token = p_token and consumed_at is null and expires_at > now()
   order by claimed_at desc limit 1;
  if not found then
    return jsonb_build_object('claimed', false);
  end if;
  -- The phone is returned so the completing call can be checked against it.
  -- Safe: the caller already holds the token, and only the person who tapped
  -- the invite has it.
  return jsonb_build_object('claimed', true, 'phone', v_claim.claimed_phone);
end;
$$;

revoke all on function public.claim_status(text) from public;
grant execute on function public.claim_status(text) to anon, authenticated;

-- ── the webhook records a claim. IT CREATES NOTHING. ────────────────────────
-- Called with the service role from the webhook. Deliberately incapable of
-- making an account or a membership, so a forged webhook call is inert.
create or replace function public.record_invite_claim(p_token text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_link record;
begin
  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  -- A repeated send must not fail; refresh the existing live claim instead.
  delete from public.invite_claims
   where token = p_token and consumed_at is null;

  insert into public.invite_claims (token, claimed_phone)
  values (p_token, p_phone);

  return jsonb_build_object('ok', true,
    'circle', (select name from public.circles where id = v_link.circle_id));
end;
$$;

revoke all on function public.record_invite_claim(text, text) from public;
-- Service role only: never callable by a browser.

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='invite_claims')      as table_should_be_1,
  (select count(*) from pg_proc where proname='claim_status')        as status_fn_should_be_1,
  (select count(*) from pg_proc where proname='record_invite_claim') as record_fn_should_be_1,
  (public.claim_status('no-such-token') ->> 'claimed')               as unknown_should_be_false;
