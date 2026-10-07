-- ============================================================================
-- 0056 · THE LINK IN THE REPLY WORKS
--
-- dan, 7 Oct 2026: people pressed send on "Join Trustnet: ...", got Trustnet's
-- reply, were not sure what "switch back to your browser" meant, tapped
-- "If that tab closed, open this instead" - and went round again.
--
-- MEASURED FIRST. Phone ...4488 on 6 Oct: sent at 11:44:50, signed in at
-- 11:44:56; sent AGAIN at 11:47:02, signed in again at 11:47:06. Six and four
-- seconds is the waiting page, which asks every two seconds - not a person.
-- Phone ...9911 did the same on 5 Oct.
--
-- THE CAUSE. The waiting page and the reply's link were two doors onto ONE
-- single-use claim. The page nearly always gets there first; the link then
-- opens in a browser that is not that page's, finds the claim spent, and the
-- app drops them on Sign in without a word. join-link-sim.js reproduces it
-- with the real app in two browsers.
--
-- THE FIX. The link gets a pass of its own, finish_secret, minted with the
-- claim and sent only in the reply. complete-join accepts it on its own, so
-- either door can finish and neither can use up the other. Each still works
-- once, and only inside the claim's ten minutes.
--
-- WHAT IT DOES NOT CHANGE. The waiting page's half is exactly as before: the
-- finish door never touches consumed_at, so it does not keep a claim alive a
-- second longer than today.
--
-- THE COST, accepted by dan: for those ten minutes the reply's link is a live
-- way into the account. Forwarded in that time, it signs the recipient in once.
-- The same as an email sign-in link.
--
-- Run each numbered statement on its own in the SQL editor. Every statement is
-- idempotent; stopping halfway leaves a complete state.
-- ============================================================================

-- 1 · the reply's own pass
alter table public.invite_claims add column if not exists finish_secret text;

-- 2 · when it was used. Separate from consumed_at, which is the waiting page's.
alter table public.invite_claims add column if not exists finish_used_at timestamptz;

-- 3 · a pass names exactly one claim
create unique index if not exists invite_claims_finish_secret_uniq
  on public.invite_claims (finish_secret) where finish_secret is not null;

-- 4 · record_invite_claim mints the pass with the claim and returns it, so the
--     webhook can put it in the reply. Otherwise 0052's body, unchanged.
--     gen_random_uuid() rather than gen_random_bytes(): pgcrypto lives in
--     `extensions` on Supabase, not `public` (0053 learned that the hard way),
--     and mint_signin_token already uses this.
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
begin
  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;

  if not found then
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

  delete from public.invite_claims
   where token = p_token and consumed_at is null;

  v_finish := replace(gen_random_uuid()::text, '-', '');
  insert into public.invite_claims (token, claimed_phone, claimed_name, finish_secret)
  values (p_token, p_phone, v_name, v_finish);

  return jsonb_build_object('ok', true, 'kind', v_kind, 'finish', v_finish,
    'circle', case when v_kind = 'invite'
                then (select name from public.circles where id = v_link.circle_id)
                else null end);
end;
$function$;

-- 5 · the same grant 0052 gave it
grant execute on function public.record_invite_claim(text, text, text) to service_role;
