-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — 'app' stops being a legal contact_method
--
-- ORDER MATTERS AND THIS FILE IS LAST. Until v0.67.0 is live on every client,
-- MEMBER_FIELDS still writes the literal 'app' whenever contactMethod is
-- empty. Applying this first would make that write violate the constraint,
-- saveMembers would bail at its error branch, and AppState would be left ahead
-- of the database with no way back. Client first, then 0036, then this.
--
-- DO NOT APPLY until the version footer reads v0.67.0 on the devices in use.
-- A phone running an older build from its home screen keeps that build until
-- the app is force-closed — which is exactly how a client from 10 August was
-- still able to write to this database on 20 August.
--
-- NO DOLLAR-QUOTED BLOCKS. The first draft used one for a pre-flight count and the
-- Supabase SQL editor answered `syntax error at or near "v"` — it does not
-- reliably handle dollar-quoted blocks mixed with other statements. It is not
-- needed anyway: ADD CONSTRAINT validates every existing row, so if any 'app'
-- row survives the ALTER itself fails and names the constraint. The check IS
-- the pre-flight.
--
-- The constraint is also a detector. If something out there is still creating
-- contactless members, this rejects the write outright instead of letting a
-- tenth row appear quietly. members_audit (0035) says WHO; this says NO.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.members drop constraint if exists members_contact_method_check;

alter table public.members add constraint members_contact_method_check
  check (contact_method in ('whatsapp','email','linkedin','source'));

commit;

-- Expect: ALTER TABLE, ALTER TABLE, COMMIT.
-- If instead you see
--     ERROR: check constraint "members_contact_method_check" is violated by some row
-- then 0036 has not been run, or did not finish. Nothing has changed — it is
-- one transaction. Run 0036 first.
