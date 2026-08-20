-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — audit every member insert, temporarily
--
-- WHY: nine member rows exist with no contact, avatar null, avatar_color at
-- the column default and response_rate at the column default — a fingerprint
-- no code in this repository can produce. Eliminated by inspection: all seven
-- client paths in the current build and in v0.53.0 and v0.59.0; complete-join;
-- join_circle_via_link; accept_invite_on_signup; every other function in the
-- database (regex over pg_proc.prosrc); and the three edge functions that were
-- deployed but missing from the repo. One of them was written on 20 Aug 2026,
-- so whatever writes them is still active.
--
-- Postgres keeps NO history of a function body. A version of a function that
-- was edited in the dashboard and later overwritten would leave exactly these
-- rows and no trace of itself. 0025_recover_functions.sql exists because that
-- has already happened once. So the producer may be permanently unfindable by
-- reading, and the database has to name it instead.
--
-- app_name is the discriminator: PostgREST (the app), an edge function, or
-- 'supabase/dashboard-query-editor'. Verified firing before deployment.
--
-- THIS IS TEMPORARY. Removal block at the foot of this file — run it after
-- 2026-09-03, or once the producer is identified, whichever comes first. It
-- was applied to production by hand on 20 Aug 2026; this file exists so that
-- it is versioned going in and versioned coming out, unlike the four objects
-- (accept_invite_on_signup, bump_list_views, link_member_row, match_user_recs)
-- that were found running in production and in no migration.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create table if not exists public.members_audit (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  db_user       text,
  session_user_ text,
  app_name      text,
  client_addr   inet,
  member_row    jsonb
);

create or replace function public.audit_member_insert()
returns trigger language plpgsql security definer as $$
begin
  insert into public.members_audit
    (db_user, session_user_, app_name, client_addr, member_row)
  values
    (current_user, session_user,
     current_setting('application_name', true),
     inet_client_addr(), to_jsonb(new));
  return new;
end $$;

drop trigger if exists trg_members_audit on public.members;
create trigger trg_members_audit
  after insert on public.members
  for each row execute function public.audit_member_insert();

commit;

-- ── READ IT ────────────────────────────────────────────────────────────────
-- select at, db_user, app_name, client_addr,
--        member_row->>'name' as name, member_row->>'contact_method' as method
--   from public.members_audit order by at desc limit 20;

-- ── REMOVE IT — after 2026-09-03 ───────────────────────────────────────────
-- begin;
--   drop trigger if exists trg_members_audit on public.members;
--   drop function if exists public.audit_member_insert();
--   drop table if exists public.members_audit;
-- commit;
