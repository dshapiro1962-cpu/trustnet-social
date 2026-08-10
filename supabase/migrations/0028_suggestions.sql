-- ============================================================================
-- 0028_suggestions.sql                                           9 Aug 2026
--
-- THE SUGGESTION QUEUE. Somewhere for a shared-interest suggestion to live
-- between being found and being accepted.
--
-- HYBRID OWNERSHIP (dan's call): a suggestion belongs to the USER, and
-- REMEMBERS which of their circles matched. Neither alternative worked:
--   * circle-owned — when Rina is in BOTH your reading circle and your Friends
--     circle and both accept books, the matcher must either send two
--     suggestions for one book or pick one by an invented rule (first created?
--     alphabetical?). Any tie-break is arbitrary.
--   * user-owned with no circle — one suggestion, but accepting leaves the item
--     unfiled, which is exactly the contextless state that made items
--     unfindable earlier this week.
-- Hybrid: ONE suggestion, matched_circles remembered, and on accept it files
-- into the matching circle — or asks, when more than one matched.
--
-- NOTHING ENTERS THE LIBRARY WITHOUT THE USER. A pending suggestion is not a
-- recommendation; it becomes one only when accepted.
-- ============================================================================

create table if not exists public.suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  canonical_id    uuid not null references public.canonicals(id) on delete cascade,

  -- WHO vouched for it and HOW it reached you — the trust chain, stored, so the
  -- card can say "Rina answered this, she is in your reading circle" rather
  -- than presenting an item from nowhere.
  from_person_id  uuid references public.people(id) on delete set null,
  from_user_id    uuid references public.users(id) on delete set null,
  via             text not null check (via in ('answer','save')),
  source_note     text,

  -- Which of MY circles matched, and on which interest. Plural: two circles may
  -- both accept books.
  matched_circles uuid[] not null default '{}'::uuid[],
  matched_interest text not null,

  status          text not null default 'pending'
                  check (status in ('pending','accepted','dismissed')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

-- ONE suggestion per user per item, ever. Without this the sweep re-offers the
-- same book on every run, and a dismissal would not stick.
create unique index if not exists suggestions_user_canonical_uniq
  on public.suggestions (user_id, canonical_id);
create index if not exists idx_suggestions_pending
  on public.suggestions (user_id, status) where status = 'pending';

alter table public.suggestions enable row level security;
drop policy if exists suggestions_owner on public.suggestions;
create policy suggestions_owner on public.suggestions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── the sweep's watermark ───────────────────────────────────────────────────
-- The sweep runs every few minutes and asks "what has appeared since I last
-- ran?". Storing the watermark makes the job restartable and idempotent: a
-- crashed run repeats a few minutes of work rather than skipping it. dan chose
-- the sweep over a database trigger deliberately — a trigger runs INSIDE the
-- other person's save, so a fault in this feature would stop Rina being able to
-- answer questions at all.
create table if not exists public.sweep_state (
  name    text primary key,
  last_at timestamptz not null default now() - interval '1 day'
);
insert into public.sweep_state (name) values ('suggestions')
  on conflict (name) do nothing;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='suggestions')        as suggestions_should_be_1,
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='sweep_state')        as sweep_state_should_be_1,
  (select count(*) from pg_indexes
    where indexname='suggestions_user_canonical_uniq')               as uniq_should_be_1;
