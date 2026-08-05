-- ============================================================================
-- 0009_extensions_and_canonical_ai.sql                                            5 Aug 2026
--
-- Fills one of the lost 0002–0009 slots, reconstructed 5 Aug 2026.
--
-- WHY IT IS NUMBERED 0009 AND NOT 0018:
-- 0014 declares `p_embedding vector(1536)` and 0015 does the same. Nothing in
-- the committed migrations ever created the pgvector extension — it was enabled
-- by hand in the Supabase dashboard during the lost era. On the live database
-- that is invisible. On a REBUILD from source, 0014 aborts with
-- "type vector does not exist", and every migration after it never runs.
--
-- Caught by schema-sim, which asserts the extension is created before the first
-- use of vector(1536). Ordering is the whole point of this file: putting it in
-- 0018 would be correct SQL that still cannot rebuild the database.
--
-- pgcrypto and pg_trgm are already handled by 0001.
-- ============================================================================
create extension if not exists vector;    -- pgvector: canonicals.embedding, search_library_hybrid

-- ── canonicals AI columns ───────────────────────────────────────────────────
-- These live HERE, not in 0018, because 0014 (search_library_hybrid) and 0015
-- SELECT c.primary_category and c.embedding directly. Declared after them, a
-- rebuild aborts at 0014 and every later migration silently never runs — the
-- same ordering trap as the extension above. Caught by building the database
-- from these files for real.
alter table public.canonicals add column if not exists primary_category text;
alter table public.canonicals add column if not exists ai_tags text[] not null default '{}'::text[];
alter table public.canonicals add column if not exists embedding vector(1536);
alter table public.canonicals add column if not exists classified_at timestamptz;
alter table public.canonicals add column if not exists class_source text;
