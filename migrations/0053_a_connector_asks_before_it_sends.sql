-- 0053 · A CONNECTOR ASKS BEFORE IT SENDS
--
-- Trustnet is applying to be a connector in Muse (Meta). A Muse user who is
-- also a Trustnet member should be able to say "planning a few days in Puglia,
-- what have my people told me about it" and have Muse read their library and,
-- when the library is thin, ask their circle.
--
-- TWO THINGS THIS HAS TO GET RIGHT, and they are the whole design.
--
-- 1. A CONNECTOR NEVER MESSAGES ANYONE. The people in a circle are real, and
--    they are in it because the member trusts them. An agent that can message
--    them because someone mumbled at it is a different product and a worse
--    one. So `draft_question` writes a DRAFT and hands back a link; the member
--    opens it, reads exactly who will receive exactly what, and presses send.
--    Only then does send-query run, unchanged. This is the same shape the
--    invite flow already has: Trustnet opens YOUR WhatsApp with a message
--    ready, and YOU press send.
--
-- 2. ISOLATION IS ENFORCED BY THE DATABASE, NOT BY MY FILTERING. The MCP
--    server mints a real user session from the connector token and reads
--    through it, so RLS is what keeps one member out of another's library. A
--    mistake in application code then returns nothing instead of returning
--    someone else's rows. That is the difference between a bug and a breach,
--    and this project has been burned by exactly this before: identity_guards
--    ran as postgres with RLS off and could not see the fault that broke
--    saving.
--
-- Nothing here changes an existing table, an existing policy or an existing
-- function. Two new tables and four functions, used only by code that does not
-- exist yet, so applying it cannot affect anything running today.
--
-- Each statement is numbered, idempotent and independent: the SQL editor sends
-- every statement on its own connection and there is no shared transaction.

-- ── 1 · the token a member gives to a connector ───────────────────────────
-- THE PLAINTEXT IS NEVER STORED. Only its sha256, exactly as a password would
-- be: a leak of this table hands an attacker nothing they can use.
create table if not exists public.connector_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  token_hash   text not null unique,
  label        text not null default 'Muse',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

-- ── 2 · RLS on. A member may SEE and REVOKE their own tokens and nothing
--        else. There is deliberately no insert policy: minting goes through
--        the SECURITY DEFINER function in 5, which is the only thing that
--        knows how to hash.
alter table public.connector_tokens enable row level security;

create index if not exists idx_connector_tokens_owner
  on public.connector_tokens (owner_id) where revoked_at is null;

-- Postgres has no `create or replace policy`, and `drop` then `create` is two
-- statements on two connections with a window in between where the table is
-- unprotected. Each policy therefore creates itself only if absent, in ONE
-- statement, so re-running this file is a no-op and stopping between anything
-- leaves a complete state.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'connector_tokens'
                    and policyname = 'connector_tokens_select_own') then
    create policy connector_tokens_select_own on public.connector_tokens
      for select using (owner_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'connector_tokens'
                    and policyname = 'connector_tokens_revoke_own') then
    create policy connector_tokens_revoke_own on public.connector_tokens
      for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $$;

-- ── 3 · a question a connector has WRITTEN but nobody has SENT ────────────
-- member_ids is null for "the whole circle", which is what send-query already
-- means by an absent list. expires_at is short: a draft is a thing you confirm
-- in the next minute, not next week.
create table if not exists public.connector_drafts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  circle_id     uuid not null references public.circles(id) on delete cascade,
  text          text not null,
  member_ids    uuid[],
  confirm_token text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 minutes'),
  confirmed_at  timestamptz,
  discarded_at  timestamptz,
  query_id      uuid
);

-- ── 4 · nobody reads this from a browser with a session. The confirm page is
--        signed out and the TOKEN is its credential, so the functions below
--        are SECURITY DEFINER and RLS has no policies at all.
alter table public.connector_drafts enable row level security;

create index if not exists idx_connector_drafts_live
  on public.connector_drafts (expires_at)
  where confirmed_at is null and discarded_at is null;

-- ── 5 · mint a token, and return the plaintext ONCE ───────────────────────
-- The caller is a signed-in member on the connect page. gen_random_bytes gives
-- 32 bytes of real entropy; encode() makes it URL-safe hex. The row keeps only
-- the hash, so this return value is the only time the token exists in readable
-- form anywhere.
create or replace function public.mint_connector_token(p_label text default 'Muse')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.connector_tokens (owner_id, token_hash, label)
  values (v_uid, encode(digest(v_token, 'sha256'), 'hex'), coalesce(nullif(btrim(p_label), ''), 'Muse'));
  return v_token;
end;
$$;

revoke all on function public.mint_connector_token(text) from public;
grant execute on function public.mint_connector_token(text) to authenticated;

-- ── 6 · resolve a token hash to its owner, and record the use ─────────────
-- Service role only: this is the MCP server's front door. It returns null for
-- a revoked or unknown token rather than raising, so the caller answers 401
-- once, in one place.
create or replace function public.connector_owner(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  update public.connector_tokens
     set last_used_at = now()
   where token_hash = p_token_hash
     and revoked_at is null
  returning owner_id into v_owner;
  return v_owner;
end;
$$;

revoke all on function public.connector_owner(text) from public;
grant execute on function public.connector_owner(text) to service_role;

-- ── 7 · what the confirm page is allowed to know ──────────────────────────
-- Names, not numbers. The page has to show WHO will be messaged so the member
-- can judge it, and it must not become a way to read a circle's phone numbers
-- out of Trustnet — which is a promise the privacy policy and the connector's
-- own access requirements both make in writing.
create or replace function public.connector_draft_view(p_confirm_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d     public.connector_drafts%rowtype;
  v_names text[];
  v_circle text;
begin
  select * into v_d from public.connector_drafts
   where confirm_token = p_confirm_token;
  if not found then
    return jsonb_build_object('state', 'not_found');
  end if;
  if v_d.confirmed_at is not null then
    return jsonb_build_object('state', 'already_sent');
  end if;
  if v_d.discarded_at is not null then
    return jsonb_build_object('state', 'discarded');
  end if;
  if v_d.expires_at < now() then
    return jsonb_build_object('state', 'expired');
  end if;

  select name into v_circle from public.circles where id = v_d.circle_id;

  select coalesce(array_agg(m.name order by m.name), '{}')
    into v_names
    from public.members m
   where m.circle_id = v_d.circle_id
     and m.owner_id = v_d.owner_id
     and (v_d.member_ids is null or m.id = any (v_d.member_ids));

  return jsonb_build_object(
    'state', 'ready',
    'circle', v_circle,
    'text', v_d.text,
    'recipients', to_jsonb(v_names),
    'count', coalesce(array_length(v_names, 1), 0)
  );
end;
$$;

revoke all on function public.connector_draft_view(text) from public;
grant execute on function public.connector_draft_view(text) to service_role;

-- ── 8 · claim a draft for sending, exactly once ───────────────────────────
-- The single-use gate. `confirmed_at is null` in the WHERE is what makes a
-- double tap send one message rather than two: the second update matches no
-- row. The caller sends only if it gets a row back.
create or replace function public.connector_draft_claim(p_confirm_token text, p_text text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.connector_drafts%rowtype;
begin
  update public.connector_drafts
     set confirmed_at = now(),
         text = coalesce(nullif(btrim(p_text), ''), text)
   where confirm_token = p_confirm_token
     and confirmed_at is null
     and discarded_at is null
     and expires_at > now()
  returning * into v_d;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  return jsonb_build_object(
    'claimed', true,
    'owner_id', v_d.owner_id,
    'circle_id', v_d.circle_id,
    'text', v_d.text,
    'member_ids', to_jsonb(v_d.member_ids)
  );
end;
$$;

revoke all on function public.connector_draft_claim(text, text) from public;
grant execute on function public.connector_draft_claim(text, text) to service_role;

-- ── 9 · discarding is a decision too, and it should stick ─────────────────
create or replace function public.connector_draft_discard(p_confirm_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.connector_drafts
     set discarded_at = now()
   where confirm_token = p_confirm_token
     and confirmed_at is null
     and discarded_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.connector_draft_discard(text) from public;
grant execute on function public.connector_draft_discard(text) to service_role;

-- ── 10 · digest() lives in pgcrypto, which 0001 already creates. This is
--         here so a fresh database applying 0053 alone does not fail on 5.
create extension if not exists "pgcrypto";
