-- ============================================================================
-- 0019_rls_policies.sql                                          5 Aug 2026
--
-- Completes 0018. Where 0018 could only ENABLE row-level security on the three
-- recovered tables and fail closed, this file carries the ACTUAL policies,
-- transcribed verbatim from pg_policies on production (dan, 5 Aug 2026).
--
-- These are a TRANSCRIPT, not an inference. An earlier draft of 0018 invented
-- policies from the naming conventions in 0001, and the real dump proved that
-- guess WRONG IN THE DANGEROUS DIRECTION: it assumed public_lists needed a
-- SELECT policy letting anyone read a list with is_public = true. Production
-- has no such policy — public_lists is OWNER-ONLY, and shared lists reach
-- non-owners through the get-collection edge function, which uses the service
-- role and bypasses RLS entirely. Shipping the guess would have opened direct
-- client reads that production deliberately does not allow.
--
-- Only three policies were missing from the committed migrations; the other
-- fifteen already live in 0001. Idempotent: drop-then-create, same as 0001.
-- ============================================================================

-- circle_invite_links: the reusable "share one link" invite. Owner-only, like
-- every other owner-scoped table.
drop policy if exists cil_owner on public.circle_invite_links;
create policy cil_owner on public.circle_invite_links
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- public_lists: OWNER-ONLY, deliberately. The name is misleading — "public"
-- describes the artefact, not the access path. Non-owners never read this table
-- directly; get-collection (service role) serves shared lists. Do NOT add a
-- broader SELECT policy without deciding that on purpose: it would widen access
-- beyond what the product currently grants.
drop policy if exists public_lists_owner on public.public_lists;
create policy public_lists_owner on public.public_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- notifications: an explicit SELECT policy alongside the ALL policy from 0001.
-- Redundant in effect, present in production; transcribed so a rebuilt database
-- matches byte for byte rather than "closely enough".
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select using (user_id = auth.uid());

-- ── category_corrections: INTENTIONALLY POLICY-LESS ─────────────────────────
-- RLS is enabled by 0018 and there is NO policy, on production or here. That
-- means no client can read or write it — which is correct, because nothing
-- does: a grep of the app and all 19 edge functions finds ZERO references.
-- The table was built for an audit trail that was never wired up. It is dead
-- weight, not a security hole (RLS with no policy denies everything).
-- DECISION NEEDED, not urgent: wire it to the category-correction flow so
-- class_source = 'user' has an audit trail, or drop the table in a later
-- migration. Leaving it undocumented is what turns dead tables into mysteries.

-- ── VERIFICATION — expect one row, count 0 ──────────────────────────────────
select 'missing_policies' as check_name, count(*) as should_be_zero
from (values ('circle_invite_links','cil_owner'),
             ('public_lists','public_lists_owner'),
             ('notifications','notif_select')) as p(t, n)
where not exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = p.t and policyname = p.n);
