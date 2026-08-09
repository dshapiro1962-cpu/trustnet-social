-- ============================================================================
-- 0027_custom_interests.sql                                      9 Aug 2026
--
-- CUSTOM INTERESTS. The twelve built-in interests were a closed list I invented,
-- and dan's own data broke it immediately: "gas stove repair service" maps to
-- nothing, and there is no wine, music, film, gardening or fitness. A fixed
-- vocabulary silently assumes someone anticipated every interest anyone has.
--
-- HOW A CUSTOM INTEREST WORKS — and why not the two obvious alternatives:
--
--   * NOT free text matched by MEANING. That handles everything and destroys
--     the one property this product cannot lose: every trust decision must be
--     explainable in one sentence. "It's a wine bar and your circle is about
--     wine" is checkable; "0.83 similarity" is not.
--
--   * NOT learned from whatever the circle already holds. dan's ski circle
--     contains a dermatologist, two barbecue grills and a butcher. Learning
--     from contents would teach "skiing" that dermatologists count — the exact
--     failure that put a dermatologist on the "ski" results screen.
--
--   * INSTEAD: the interest name is EXPANDED into the terms that identify it
--     ("wine" -> winery, wine bar, wine shop, vineyard, יין), the user SEES the
--     terms and confirms them, and matching then works identically to a
--     built-in. Generation is fallible — the enricher once produced "hair
--     removal machine" — so the terms are shown before they take effect.
--     Infer, then ask. Never assume.
--
-- Idempotent. Safe on production.
-- ============================================================================

-- Built-in interests carry no terms: the shared vocabulary in enrich_core.ts
-- defines them. Custom interests carry their own, confirmed by the owner.
alter table public.circle_interests
  add column if not exists terms text[] not null default '{}'::text[];

alter table public.circle_interests
  add column if not exists is_custom boolean not null default false;

-- A custom interest must actually define itself. Without terms it can never
-- match anything, and a silent no-op is worse than a rejected insert.
alter table public.circle_interests
  drop constraint if exists circle_interests_custom_has_terms;
alter table public.circle_interests
  add constraint circle_interests_custom_has_terms
  -- COALESCE IS LOAD-BEARING: array_length('{}', 1) returns NULL, not 0, and a
  -- CHECK passes unless it evaluates to FALSE. Without this the constraint
  -- silently accepts exactly what it exists to refuse — proven by inserting an
  -- empty-terms row against the first version and watching it succeed.
  check (is_custom = false or coalesce(array_length(terms, 1), 0) >= 1);

-- Terms are matched WHOLE-WORD and case-insensitively, exactly like the
-- built-in vocabulary. Substring matching is what made "skin" match "ski".
create index if not exists idx_circle_interests_terms
  on public.circle_interests using gin (terms);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='circle_interests'
      and column_name in ('terms','is_custom'))                    as cols_should_be_2,
  (select count(*) from pg_constraint
    where conname = 'circle_interests_custom_has_terms')           as constraint_should_be_1;
