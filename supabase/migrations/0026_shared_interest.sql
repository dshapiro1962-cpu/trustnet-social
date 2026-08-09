-- ============================================================================
-- 0026_shared_interest.sql                                       8 Aug 2026
--
-- Groundwork for shared-interest suggestions. SCHEMA ONLY — no behaviour
-- changes, nothing user-visible. See shared_interest_agent_spec.md.
--
-- THE FEATURE, in one line: X is already in a circle of mine; he answers a
-- query or saves an item; if it is a book and a circle of mine is about books,
-- it appears in my Inbox as a suggestion. Automatic. X opts OUT per item.
-- (NOT degree 2 — that is active, per-question, opt-IN, and lives on the query
-- dialog. The two were tangled because they shared a toggle. They no longer do.)
-- ============================================================================

-- ── 1. PERSIST `kind` ───────────────────────────────────────────────────────
-- The enricher already produces this — "novel", "children's book", "ski
-- resort", "iron lattice monument" — writes it into search_doc as TEXT, and
-- stores it in NO COLUMN. Third time this pattern has appeared: `resolved` was
-- computed and discarded until v0.42.0; seven whole functions existed only in
-- production until v0.47.0.
--
-- WHY IT MATTERS HERE: kind is the only signal precise enough to tell a book
-- from a museum. primary_category puts both in 'culture'.
alter table public.canonicals add column if not exists kind text;

-- ── 2. THE ANSWER DIALOG NEEDS ITS OWN OPT-OUT ──────────────────────────────
-- shared_to_network lives on RECOMMENDATIONS (the save card). A query_responses
-- row has no such column, so the toggle on the ANSWER screen had nowhere to
-- store its state. DEFAULT TRUE: the feature is automatic and the toggle is an
-- opt-out — X presses "shared to your network — click to unshare".
alter table public.query_responses
  add column if not exists shared_to_network boolean not null default true;

-- ── 3. WHAT EACH CIRCLE IS ABOUT ────────────────────────────────────────────
-- Only CONFIRMED interests are ever matched. A derived guess that the owner
-- never confirmed does nothing at all — silence is the safe default.
-- A circle may hold SEVERAL interests (dining could be restaurants AND wine);
-- a match on any one counts.
create table if not exists public.circle_interests (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id) on delete cascade,
  owner_id   uuid not null references public.users(id) on delete cascade,
  interest   text not null,
  source     text not null default 'confirmed'
             check (source in ('confirmed','declined')),
  created_at timestamptz not null default now()
);
create unique index if not exists circle_interests_uniq
  on public.circle_interests (circle_id, interest);
create index if not exists idx_circle_interests_owner
  on public.circle_interests (owner_id);

alter table public.circle_interests enable row level security;
drop policy if exists circle_interests_owner on public.circle_interests;
create policy circle_interests_owner on public.circle_interests
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 'declined' means the owner said "not now" — the circle is excluded from the
-- feature until they change it, and we must not ask again. Stored rather than
-- inferred, so a silent circle is distinguishable from an unasked one.

-- ── 4. DROP degree2_enabled ─────────────────────────────────────────────────
-- It defaults true, is read by NOTHING, and neither feature needs it: passive
-- consent is per-item (the two shared_to_network columns above), and active
-- degree-2 reach is chosen per-question on the query dialog. Leaving it is a
-- flag that LOOKS meaningful and is not — the same trap as `verified` and
-- `kind` before they were wired up. Removing it now means nobody later builds
-- against a switch that never did anything.
alter table public.users drop column if exists degree2_enabled;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='canonicals' and column_name='kind')          as kind_should_be_1,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='query_responses'
      and column_name='shared_to_network')                                                   as answer_flag_should_be_1,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='circle_interests')                           as interests_should_be_1,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='degree2_enabled')    as dead_flag_should_be_0;
