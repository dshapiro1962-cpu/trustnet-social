-- ============================================================================
-- 0020_canonical_contact.sql                                     5 Aug 2026
--
-- A recommendation you cannot act on is not a recommendation.
--
-- canonicals has google_url, website_url and linkedin_url — and no phone. The
-- only phone columns in the database belong to users and wa_otp, i.e. people
-- who sign in. So when chat-import extracted a provider's number it appended it
-- to the NOTE as prose:
--     "מעולה, אמין, מקצועי, אחראי. 050-5303690"
-- which cannot be dialled, cannot be queried, and — most costly — cannot be
-- used as an identity anchor. match_canonical compares NAME SIMILARITY only, so
-- two "שי" with the same number stay two entities while two unrelated ones with
-- similar names may merge. The strongest identity signal in the data was
-- invisible to dedup.
--
-- Built BEFORE beta deliberately. This is a schema-shape error, not a volume
-- problem: it is equally wrong at 6 rows and 6,000, and the backfill is trivial
-- today and miserable later. Beta multiplies exactly the shape that needs it —
-- handymen, doctors, babysitters — recommendations that are worthless without
-- a number.
--
-- Idempotent. Safe on production.
-- ============================================================================

-- The raw number as written by whoever recommended them: display it as given.
alter table public.canonicals add column if not exists phone text;

-- The comparison key. GENERATED, not maintained: phone_key() already exists
-- (0017) and is immutable, so Postgres keeps this in sync and no application
-- code can ever write an inconsistent value. Last 9 digits — the same rule
-- users.phone_key and wa-signin's phoneKey() use, so an Israeli number written
-- 050-530-3690, 0505303690 or +972505303690 collapses to one key.
alter table public.canonicals
  add column if not exists phone_key text generated always as (phone_key(phone)) stored;

-- Identity lookups, and the dedup short-circuit in match_canonical.
create index if not exists canonicals_phone_key_idx
  on public.canonicals (phone_key) where phone_key is not null;

-- ── match_canonical: PHONE BEATS NAME ───────────────────────────────────────
-- A matching phone is proof; a similar name is a guess. Checking the phone
-- first fixes the case name-similarity cannot: two providers both called "שי"
-- with different numbers stay separate, and one provider written "שושן שמוליק"
-- and "שושן-שמוליק" merges on the number alone even if the names had drifted
-- further apart than the 0.45 trigram threshold.
--
-- Signature is EXTENDED, not replaced: p_phone defaults to null, so every
-- existing caller (receive-response, extract-chat-recs) keeps working unchanged
-- and simply gets the old name-similarity behaviour until it passes a phone.
create or replace function match_canonical(p_name text, p_location text, p_phone text default null)
returns uuid language plpgsql stable as $$
declare
  v_id  uuid;
  v_key text;
begin
  -- 1. phone is decisive
  v_key := phone_key(p_phone);
  if v_key is not null and length(v_key) >= 9 then
    select id into v_id from public.canonicals
    where phone_key = v_key
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- 2. fall back to the original name/location similarity, unchanged
  select id into v_id
  from public.canonicals
  where similarity(lower(name), lower(p_name)) > 0.45
    and (p_location is null
         or location is null
         or lower(location) = lower(p_location)
         or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
  order by similarity(lower(name), lower(p_name)) desc
  limit 1;
  return v_id;
end;
$$;

-- ── BACKFILL: lift numbers already trapped in notes ─────────────────────────
-- Non-destructive: the note keeps its text, the canonical gains a phone. Only
-- fills where the canonical has none, so re-running cannot overwrite a better
-- value. Israeli mobile/landline shapes: 0XX-XXXXXXX with optional separators.
update public.canonicals c
set phone = m.found
from (
  select r.canonical_id,
         (regexp_match(r.note, '0[0-9]{1,2}[- ]?[0-9]{3}[- ]?[0-9]{4}'))[1] as found
  from public.recommendations r
  where r.note ~ '0[0-9]{1,2}[- ]?[0-9]{3}[- ]?[0-9]{4}'
) as m
where c.id = m.canonical_id
  and m.found is not null
  and c.phone is null;

-- ── VERIFICATION — expect column present, and a count of recovered numbers ──
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='canonicals'
      and column_name in ('phone','phone_key'))            as cols_should_be_2,
  (select count(*) from public.canonicals where phone is not null) as phones_recovered,
  (select count(*) from pg_proc where proname='match_canonical')   as match_fn_should_be_1;
