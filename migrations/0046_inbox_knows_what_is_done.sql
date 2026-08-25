-- ============================================================================
-- 0046 · THE INBOX MUST KNOW WHAT HAS ALREADY BEEN DEALT WITH
--
-- Two faults, measured on production 25 Aug 2026, with one shape.
--
-- (1) AN ANSWER COULD NEVER BE MARKED SAVED. `query_responses` has exactly one
--     policy, from 0001:
--
--         create policy qr_read_by_query_owner on public.query_responses
--           for select using (...)
--
--     `for select`. There is no UPDATE policy and there never has been. So
--     saveQueries' `update ... set saved_to_library = true` matched ZERO ROWS
--     and returned NO ERROR — PostgREST does not fail, the row is simply
--     invisible to the update. The client checked `r.error`, saw none, and
--     carried on. Fifteen answers going back to 19 Aug all read false.
--
--     This is precisely the trap this project already wrote down:
--     "Assert row outcomes, never the absence of an error. With only a select
--     policy a DELETE does not error — it silently removes nothing, and a guard
--     reading 'no error' passes for the wrong reason." (CLAUDE.md, 24 Aug.)
--
--     FIXED WITH AN RPC, NOT A POLICY. A blanket UPDATE policy would let the
--     asker rewrite the ANSWER ITSELF — someone else's words. RLS is row-level;
--     it cannot restrict which columns. A security-definer function can, and it
--     is the narrowest thing that works: it checks you own the query and
--     touches one boolean.
--
-- (2) AN ANSWERED OR LAPSED REQUEST KEPT A LIVE "Answer" BUTTON. Nothing ever
--     marked the notification handled, so it sat in the inbox looking actionable
--     for ever. Pressing it produced "This link was already used" or, past the
--     72-hour token life, "This link has expired". `notifications.handled_at`
--     records that it is done. Expiry needs no column: the TTL is a fixed 72
--     hours from creation (0001_initial_schema.sql:195) and the client already
--     has created_at.
--
-- NOT the existing `read` column. That means "seen". Making it also mean
-- "handled" is the matched_circles mistake — one column, two meanings — which
-- cost a morning on 25 Aug.
--
-- The Supabase SQL editor sends EACH STATEMENT ON ITS OWN CONNECTION. Numbered,
-- idempotent, run one at a time. No begin/commit.
-- ============================================================================

-- 1 · LOOK FIRST. Expect exactly one row: qr_read_by_query_owner, cmd SELECT.
--     If an UPDATE policy already exists here, STOP and re-read this file —
--     the reasoning above is then wrong about the running database.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'query_responses'
order by cmd, policyname;

-- 2 · The narrowest thing that works. SECURITY DEFINER runs as the function
--     owner, which works here by OWNER EXEMPTION rather than superuser bypass:
--     it depends on the owner owning the tables and the tables not being
--     FORCE'd. Both held when this was written (measured 24 Aug); re-check with
--     statement 6 if this ever stops working.
create or replace function public.mark_response_saved(p_response_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select q.sent_by into v_owner
  from public.query_responses qr
  join public.queries q on q.id = qr.query_id
  where qr.id = p_response_id;

  -- Returns FALSE rather than raising: the caller asserts the ROW OUTCOME, and
  -- "no row was marked" must be distinguishable from "the call failed".
  if v_owner is null or v_owner <> auth.uid() then
    return false;
  end if;

  update public.query_responses
     set saved_to_library = true
   where id = p_response_id;

  return true;
end $$;

-- 3 · Only signed-in callers, never anon.
revoke all on function public.mark_response_saved(uuid) from public;

-- 4 · ...
grant execute on function public.mark_response_saved(uuid) to authenticated;

-- 5 · The inbox needs somewhere to record that a request is done with.
alter table public.notifications add column if not exists handled_at timestamptz;

-- 6 · Backfill: every notification whose response token has already been spent
--     is, by definition, handled. This is what clears the stale Answer buttons
--     sitting in inboxes right now.
update public.notifications n
   set handled_at = coalesce(qr.responded_at, now())
  from public.query_responses qr
 where qr.response_token = n.response_token
   and qr.token_used = true
   and n.handled_at is null;

-- 7 · Verify. `still_live` should be only the requests genuinely awaiting an
--     answer; anything older than 72 hours there is lapsed and the client will
--     now say so rather than offering a button.
select count(*) filter (where handled_at is not null) as marked_handled,
       count(*) filter (where handled_at is null
                          and response_token is not null) as still_live,
       count(*)                                          as total_notifications
from public.notifications;
