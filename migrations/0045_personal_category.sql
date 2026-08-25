-- ============================================================================
-- 0045 · YOUR CATEGORY IS YOURS
--
-- primary_category lives on CANONICALS, which are SHARED — one row per thing,
-- used by every member's library. So it can never hold a personal category:
-- two people would overwrite each other, and RLS only lets you update
-- canonicals you created, so you could categorise your own items and not the
-- ones you accepted from someone else. An incoherent capability.
--
-- A personal category belongs on RECOMMENDATIONS, which is already per-member
-- and already carries your note, rating, tags and circle.
--
-- TWO LAYERS, AND THEY ANSWER DIFFERENT QUESTIONS:
--
--   recommendations.category    yours, free text, a USE-CASE.
--                               "shabbat dinner", "quick lunch", "worth the
--                               drive". Drives your library, your filter row,
--                               your chips. Nothing coerces it.
--
--   canonicals.primary_category shared, one of eight, a TYPE. Invisible to
--                               you. Exists so suggestions and taste-match
--                               have something comparable across accounts —
--                               a vocabulary everyone shares or nobody's
--                               recommendations reach anyone.
--
-- Today one field is asked to answer both questions, which is why it answers
-- neither: "other" is not a category, it is an admission that the eight did
-- not fit. That admission is also what disqualified primary_category as an
-- identity discriminator (24 Aug).
--
-- IF YOU ARE READING THIS BECAUSE YOU FOUND TWO CATEGORY COLUMNS AND DO NOT
-- KNOW WHICH TO USE: displaying to the owner, filtering their library, or
-- anything the owner typed → recommendations.category. Matching across
-- accounts, suggestions, taste-match → canonicals.primary_category. Never the
-- other way round.
--
-- The Supabase SQL editor sends EACH STATEMENT ON ITS OWN CONNECTION. Numbered,
-- idempotent, run one at a time. No begin/commit — there is no shared
-- transaction to commit.
-- ============================================================================

-- 1 · the column. Nullable: an item you have not categorised falls back to the
--     canonical's primary_category for display, so nothing changes until you
--     start using it.
alter table public.recommendations add column if not exists category text;

-- 2 · verify. Expect with_category = 0 on first run and total = your row count.
select count(*) filter (where category is not null) as with_category,
       count(*)                                    as total
from public.recommendations;
