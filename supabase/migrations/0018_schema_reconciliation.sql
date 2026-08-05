-- ============================================================================
-- 0018_schema_reconciliation.sql            5 Aug 2026
--
-- WHY THIS FILE EXISTS
-- Migrations 0002–0009 were never committed. They were run by hand in the
-- Supabase SQL editor during early development and the statements are gone.
-- The result: the repo could NOT rebuild the database from source. Anyone
-- running 0001 + 0010–0017 against an empty project got a schema that the app
-- crashes against — most sharply, canonicals.embedding does not exist, so
-- search_library_hybrid (0015) cannot run at all and the Librarian is dead on
-- arrival.
--
-- This file reconciles the repo to the live schema, reconstructed by diffing
-- information_schema.columns (dan, 5 Aug 2026) against every committed
-- migration. It is NOT a record of what 0002–0009 actually said — those are
-- lost. It is a statement of what the database demonstrably contains.
--
-- SAFE TO RUN ON PRODUCTION: every statement is `if not exists`. Against the
-- live database it is a no-op. Against an empty one it closes the gap.
--
-- KNOWN LIMIT — READ BEFORE TRUSTING THIS FOR A REBUILD:
-- The dump this was built from lists columns, types, nullability and defaults.
-- It does NOT list foreign keys, check constraints, unique constraints, or RLS
-- policies. FKs and RLS below are RECONSTRUCTED BY INFERENCE from column names
-- and from the conventions in 0001 — they are the intent, not a transcript.
-- Before relying on this to rebuild, dump pg_constraint and pg_policies from
-- production and reconcile again. Every inferred line is marked INFERRED.
-- ============================================================================

-- ── 1. MISSING TABLES ───────────────────────────────────────────────────────

-- public_lists: shareable public lists of recommendations, addressed by slug.
create table if not exists public.public_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,  -- INFERRED fk
  slug        text not null,
  title       text not null,
  description text,
  rec_ids     uuid[] not null default '{}'::uuid[],
  circle_id   uuid references public.circles(id) on delete set null,        -- INFERRED fk
  view_count  integer not null default 0,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists public_lists_slug_uniq on public.public_lists (slug);  -- INFERRED
create index if not exists idx_public_lists_owner on public.public_lists (owner_id);

-- circle_invite_links: the reusable "share one link" invite on the invite sheet.
create table if not exists public.circle_invite_links (
  id         uuid primary key default gen_random_uuid(),
  token      text not null,
  circle_id  uuid not null references public.circles(id) on delete cascade, -- INFERRED fk
  owner_id   uuid not null references public.users(id) on delete cascade,   -- INFERRED fk
  active     boolean not null default true,
  uses       integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists circle_invite_links_token_uniq on public.circle_invite_links (token);  -- INFERRED
create index if not exists idx_cil_circle on public.circle_invite_links (circle_id);

-- category_corrections: audit trail when a user overrides the AI's category.
-- This is what makes canonicals.class_source = 'user' meaningful, and why the
-- librarian must never overwrite a human correction.
create table if not exists public.category_corrections (
  id           uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.canonicals(id) on delete cascade, -- INFERRED fk
  old_category text,
  new_category text not null,
  corrected_by uuid references public.users(id) on delete set null,              -- INFERRED fk
  created_at   timestamptz not null default now()
);
create index if not exists idx_catcorr_canonical on public.category_corrections (canonical_id);

-- ── 2. MISSING COLUMNS ──────────────────────────────────────────────────────

-- canonicals AI columns moved to 0009 (see there). 0014 and 0015 REFERENCE
-- c.primary_category and c.embedding, so adding them here — after 0014 — meant
-- a rebuild from source still died at 0014 with "column does not exist".
-- Found by actually rebuilding the database from these files, not by reading
-- them. Ordering bugs are invisible to every static check.

-- invites: grew from bare tokens into circle-aware invitations with click
-- tracking (the "has it been opened yet" signal on the invite screen).
alter table public.invites add column if not exists invite_type text default 'circle_add';
alter table public.invites add column if not exists circle_id uuid references public.circles(id) on delete set null;  -- INFERRED fk
alter table public.invites add column if not exists inviter_name text;
alter table public.invites add column if not exists circle_name text;
alter table public.invites add column if not exists clicked boolean not null default false;
alter table public.invites add column if not exists clicked_at timestamptz;

-- queries: "this question is answered, and THIS was the answer I picked".
alter table public.queries add column if not exists resolved_at timestamptz;
alter table public.queries add column if not exists chosen_response_id uuid
  references public.query_responses(id) on delete set null;  -- INFERRED fk

-- recommendations: whether this take is visible to the wider network.
alter table public.recommendations add column if not exists shared_to_network boolean not null default true;

-- users: public handle, and the default for shared_to_network on new saves.
alter table public.users add column if not exists handle text;
alter table public.users add column if not exists share_by_default boolean not null default true;
create unique index if not exists users_handle_uniq on public.users (lower(handle));  -- INFERRED

-- ── 3. RLS — ENABLED, BUT POLICIES ARE NOT CAPTURED ─────────────────────────
-- RLS POLICIES ARE NOT CAPTURED. information_schema.columns does not expose
-- pg_policies, so the live policies for these three tables are unknown here.
-- Earlier drafts of this file INVENTED them by inference. That was wrong and
-- dangerous: `drop policy if exists` followed by a guessed `create policy`
-- would have silently REPLACED a working production policy with a guess —
-- either locking users out of their own data or exposing it.
--
-- Instead: enable RLS and stop. On the live database this is a no-op (already
-- enabled). On a rebuilt database it FAILS CLOSED — no policy means no access,
-- which surfaces loudly and immediately rather than leaking quietly.
--
-- TO COMPLETE THIS FILE, run against production and paste the result back:
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, policyname;
-- Note especially that public_lists needs a SELECT policy allowing non-owners
-- to read published lists (is_public = true), or sharing breaks entirely.
alter table public.public_lists         enable row level security;
alter table public.circle_invite_links  enable row level security;
alter table public.category_corrections enable row level security;

-- ── 4. VERIFICATION — expect three rows, each count 0 ───────────────────────
select 'missing_tables' as check_name, count(*) as should_be_zero
from (values ('public_lists'),('circle_invite_links'),('category_corrections')) as t(n)
where not exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = t.n)
union all
select 'missing_canonical_cols', count(*)
from (values ('primary_category'),('ai_tags'),('embedding'),('classified_at'),('class_source')) as c(n)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'canonicals' and column_name = c.n)
union all
select 'missing_other_cols', count(*)
from (values ('invites','invite_type'),('invites','clicked'),('queries','resolved_at'),
             ('queries','chosen_response_id'),('recommendations','shared_to_network'),
             ('users','handle'),('users','share_by_default')) as x(t, n)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = x.t and column_name = x.n);
