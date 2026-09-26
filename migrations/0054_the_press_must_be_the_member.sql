-- 0054 · THE PRESS MUST BE THE MEMBER
--
-- 0053 made a claim that 0053 did not keep. The connector "cannot send": true
-- of the MCP server, which has no path to a circle member and a sim that
-- proves it. But `draft_question` returns the confirm_url TO THE CALLER, and
-- that URL's token was the whole credential `connector-confirm` required.
--
-- So anything holding a connector token could draft a question and then follow
-- its own link and send it. The human press was a UI affordance, not a
-- boundary: it stopped an assistant acting unprompted, and stopped nothing
-- that decided to act.
--
-- Found on 26 Sep while verifying a command, not by a guard — the sims proved
-- the MCP server has no send path, which was true and was not the question.
--
-- THE FIX is to make sending require BEING THE MEMBER, not holding a string.
-- The caller's user id goes into the claim, and the UPDATE checks it. Doing it
-- inside the same statement as the single-use gate is deliberate: an
-- ownership check read before a separate write is a race, and this is one
-- statement that either claims the row for that member or does nothing.
--
-- The confirm page is opened on the member's own phone, where they are already
-- signed in, so nothing changes for a person. What changes is that the link is
-- no longer worth anything on its own — which is what makes it safe to hand to
-- an assistant.
--
-- Each statement is numbered, idempotent and independent.

-- ── 1 · the two-argument claim is REMOVED, not left beside the new one ─────
-- Leaving it would leave the bypass in place: it is granted to service_role,
-- and service_role is what the edge functions are. A weaker door beside a
-- stronger one is just the weaker door.
--
-- This is the one drop-then-create in the file. Between statement 1 and
-- statement 2 there is no claim function at all, so the confirm page cannot
-- send for those few seconds. That is acceptable here and nowhere else: the
-- feature is days old, has no users, and the failure mode is a page that says
-- it did not go out — not a message sent twice or to the wrong people.
drop function if exists public.connector_draft_claim(text, text);

-- ── 2 · claiming now takes the member doing it ────────────────────────────
create or replace function public.connector_draft_claim(
  p_confirm_token text,
  p_text          text,
  p_user_id       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.connector_drafts%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_member');
  end if;

  update public.connector_drafts
     set confirmed_at = now(),
         text = coalesce(nullif(btrim(p_text), ''), text)
   where confirm_token = p_confirm_token
     and owner_id = p_user_id        -- THE PRESS MUST BE THE MEMBER
     and confirmed_at is null
     and discarded_at is null
     and expires_at > now()
  returning * into v_d;

  if not found then
    -- Deliberately one answer for every reason. A caller holding a token they
    -- do not own learns nothing about whether the draft exists, whether it was
    -- already sent, or whose it is.
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

-- ── 3 · same grants as before ─────────────────────────────────────────────
revoke all on function public.connector_draft_claim(text, text, uuid) from public;

grant execute on function public.connector_draft_claim(text, text, uuid) to service_role;

-- ── 4 · discarding is now the member's too ────────────────────────────────
-- Less serious than sending — discarding a draft messages nobody — but a
-- stranger silently binning your drafts is still not something to leave open,
-- and the asymmetry would be hard to justify to anyone reading the code.
drop function if exists public.connector_draft_discard(text);

create or replace function public.connector_draft_discard(p_confirm_token text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if p_user_id is null then
    return false;
  end if;
  update public.connector_drafts
     set discarded_at = now()
   where confirm_token = p_confirm_token
     and owner_id = p_user_id
     and confirmed_at is null
     and discarded_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.connector_draft_discard(text, uuid) from public;

grant execute on function public.connector_draft_discard(text, uuid) to service_role;

-- ── 5 · VIEWING stays open, on purpose ────────────────────────────────────
-- connector_draft_view is unchanged and still needs only the token. The harm
-- this migration exists to stop is SENDING; a reader of the link sees the
-- question the member's own assistant wrote and the FIRST NAMES of people in
-- one circle, and never a phone number or an address.
--
-- Requiring a session to view would mean a member whose session had lapsed
-- opened the link and saw an error instead of their own draft, and would buy
-- nothing that matters. Stated here so the asymmetry is a decision on the
-- record rather than something that looks forgotten.
select 1;
