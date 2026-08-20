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
-- The constraint is also a detector. If something out there is still creating
-- contactless members, this rejects the write outright instead of letting a
-- tenth row appear quietly. members_audit (0035) says WHO; this says NO.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare v_app integer;
begin
  select count(*) into v_app from public.members where contact_method = 'app';
  if v_app > 0 then
    raise exception 'ABORT: % row(s) still carry contact_method app — run 0036 first', v_app;
  end if;
end $$;

alter table public.members drop constraint if exists members_contact_method_check;
alter table public.members add constraint members_contact_method_check
  check (contact_method in ('whatsapp','email','linkedin','source'));

do $$
begin
  raise notice 'OK — contact_method no longer accepts app; a missing contact is now null';
end $$;

commit;
