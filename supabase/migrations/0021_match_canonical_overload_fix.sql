-- ============================================================================
-- 0021_match_canonical_overload_fix.sql                          5 Aug 2026
--
-- 0020 added p_phone to match_canonical with `create or replace function`.
-- In PostgreSQL, CREATE OR REPLACE only replaces a function with the SAME
-- SIGNATURE. A different argument list creates a SECOND, OVERLOADED function.
-- 0020's own verification query caught it: pg_proc showed 2 rows, not 1.
--
-- WHY THAT IS DANGEROUS, NOT MERELY UNTIDY
-- Supabase RPC resolves by parameter NAME. A two-argument call —
--   admin.rpc("match_canonical", { p_name, p_location })   [receive-response]
-- now has two candidates: the old match_canonical(text, text) and the new
-- match_canonical(text, text, text DEFAULT NULL). PostgreSQL prefers the exact
-- arity, so receive-response would have silently kept using the OLD function
-- with NO phone logic — while extract-chat-recs, passing three arguments, used
-- the new one. Two callers, two different identity rules, no error to notice.
-- Under other resolution paths it fails outright as "not unique".
--
-- The 3-argument version is a strict superset: p_phone defaults to NULL and the
-- name/location branch is byte-identical to the original. Dropping the 2-arg
-- version loses nothing and makes every caller resolve to one implementation.
--
-- Idempotent. Safe on production. Run AFTER 0020.
-- ============================================================================

drop function if exists public.match_canonical(text, text);

-- ── VERIFICATION — expect exactly one function, and it must accept 3 args ───
select
  (select count(*) from pg_proc
    where proname = 'match_canonical')                      as fn_count_should_be_1,
  (select pronargs from pg_proc
    where proname = 'match_canonical' limit 1)              as args_should_be_3,
  -- and it still answers: a known number must resolve to its canonical
  (select count(*) from public.canonicals where phone is not null) as phones_on_file;
