-- 0042_fold_duplicate_canonicals.sql
--
-- ONE REAL THING, ONE CANONICAL. Measured on production 15 Sep 2026: 181 live
-- canonicals over 160 distinct normalised names — 18 collision groups, 39 rows.
-- Twenty-three of the duplicate rows sit in dan's own library, which is why
-- "מאטרה" and "air b&b" each appeared twice on his Apulia answer sheet.
--
-- WHY THIS SETS ASIDE THE STANDING RULE. CLAUDE.md says: all data is test data,
-- do not spend time correcting rows, fix what produced it and leave the row.
-- That rule is right and stays right. The exception here is that the answer
-- sheet is the screen dan shows people, and a thing appearing twice on it is
-- the most visible defect in the product. dan asked for this specifically on
-- 15 Sep after seeing it.
--
-- WHAT PRODUCED THEM IS ALREADY FIXED. The three "Tony Vespa · Indianapolis"
-- rows were created 6 Jul 2026 — before this repo's own initial commit — by an
-- enricher that invented a location with nothing to ground against. That is
-- v0.73.0's bug, fixed on 24 Aug and guarded by enrich-anchor-sim.js, which
-- names Tony Vespa and Art Pizza in its header and whose control still fails.
-- These rows are residue, not evidence of a live fault. Nothing will recreate
-- them.
--
-- FOLDING MUST REPOINT BEFORE ANYTHING IS DELETED. recommendations.canonical_id
-- is ON DELETE CASCADE, so deleting a canonical destroys the rows pointing at
-- it. Every fold below repoints first and then sets merged_into; only the junk
-- is hard-deleted, and only where dan confirmed the rows are junk.
--
-- AND IT MUST MERGE THE RECOMMENDATIONS TOO. There is no unique index on
-- (owner_id, canonical_id), so a repoint does not error — it silently leaves
-- one owner holding several rows for one thing. dan would have ended up with
-- four rows for "שושן שמוליק" and three for "רומן טמיר". The merge rule is the
-- one the app already uses in handleConfirmSaveToLibrary: keep the richest row,
-- append a note that is not already present, union the tags, take the higher
-- rating. Several people recommending the same place must keep every comment.
--
-- Numbered, idempotent, one statement at a time. No begin/commit — the Supabase
-- SQL editor sends each statement on its own connection. Re-running is safe:
-- fold_canonical returns immediately if the duplicate is already folded.

-- 1. The helper. Everything below is a call to it.
create or replace function public.fold_canonical(p_head uuid, p_dup uuid)
returns text
language plpgsql
as $function$
declare
  v_moved int := 0;
  v_merged int := 0;
begin
  if p_head = p_dup then return 'skipped: head = dup'; end if;
  if not exists (select 1 from public.canonicals where id = p_head) then
    return 'skipped: head does not exist';
  end if;
  if not exists (select 1 from public.canonicals where id = p_dup and merged_into is null) then
    return 'skipped: already folded or gone';
  end if;

  -- Everything that points at the duplicate now points at the head.
  update public.query_responses      set canonical_id = p_head where canonical_id = p_dup;
  update public.category_corrections set canonical_id = p_head where canonical_id = p_dup;

  -- SUGGESTIONS ARE UNIQUE PER (user_id, canonical_id). Caught by rehearsing
  -- this migration against production inside a transaction: a straight repoint
  -- raised suggestions_user_canonical_uniq, because a user already suggested
  -- the head. Drop the duplicate suggestion rather than the constraint - the
  -- same thing was going to be offered to them twice.
  delete from public.suggestions s
   where s.canonical_id = p_dup
     and exists (select 1 from public.suggestions t
                  where t.user_id = s.user_id and t.canonical_id = p_head);
  update public.suggestions          set canonical_id = p_head where canonical_id = p_dup;
  update public.recommendations      set canonical_id = p_head where canonical_id = p_dup;
  get diagnostics v_moved = row_count;

  -- THE SAME OWNER MAY NOW HOLD SEVERAL ROWS FOR ONE THING. Keep the richest -
  -- most notes, then oldest - and fold the others into it rather than leaving
  -- duplicate cards in a library. EVERY COMMENT COUNTS: a note that is not
  -- already contained in the survivor is appended, never dropped.
  with ranked as (
    select r.id, r.owner_id,
           row_number() over (partition by r.owner_id, r.canonical_id
                              order by length(coalesce(r.note,'')) desc, r.created_at) rn
      from public.recommendations r
     where r.canonical_id = p_head
  ),
  keeper as (select id, owner_id from ranked where rn = 1),
  losers as (select id, owner_id from ranked where rn > 1),
  merged as (
    update public.recommendations k
       set note = (
             -- CAPPED AT 1000. recommendations_note_check allows no more, and
             -- merging several people's comments is exactly how that ceiling
             -- gets hit. Caught by rehearsing against production.
             select left(string_agg(distinct n, E'\n• '), 1000)
               from (
                 select k.note as n where coalesce(btrim(k.note),'') <> ''
                 union
                 select l.note from public.recommendations l
                   join losers lo on lo.id = l.id
                  where l.owner_id = k.owner_id
                    and coalesce(btrim(l.note),'') <> ''
                    and position(btrim(l.note) in coalesce(k.note,'')) = 0
               ) s),
           tags = (
             select coalesce(array_agg(distinct t), '{}')
               from (
                 select unnest(coalesce(k.tags,'{}')) t
                 union
                 select unnest(coalesce(l.tags,'{}')) from public.recommendations l
                   join losers lo on lo.id = l.id where l.owner_id = k.owner_id
               ) u),
           -- NO coalesce TO ZERO. recommendations_rating_check is
           -- (rating >= 1 and rating <= 5); NULL passes it, 0 does not, and 128
           -- of 194 rows are unrated. Postgres GREATEST already ignores NULLs
           -- and returns NULL only when every argument is NULL, which is
           -- exactly the behaviour wanted. Caught by the rehearsal.
           rating = greatest(
             k.rating,
             (select max(l.rating) from public.recommendations l
               join losers lo on lo.id = l.id where l.owner_id = k.owner_id)),
           updated_at = now()
      from keeper kk
     where k.id = kk.id
     returning k.id)
  select count(*) into v_merged from merged;

  delete from public.recommendations r
   using (select r2.id,
                 row_number() over (partition by r2.owner_id, r2.canonical_id
                                    order by length(coalesce(r2.note,'')) desc, r2.created_at) rn
            from public.recommendations r2 where r2.canonical_id = p_head) d
   where r.id = d.id and d.rn > 1;

  -- The duplicate becomes a tombstone rather than a hole: a stale id in a
  -- client still resolves, and canonicals_norm_name_idx already excludes
  -- merged rows from identity matching.
  update public.canonicals set merged_into = p_head, updated_at = now() where id = p_dup;

  return 'folded ' || v_moved || ' recommendation(s)';
end
$function$;

-- 2.  agia marina · Leros · beach
select public.fold_canonical('b5e90496-903f-4e65-a0a0-4a65251e786e','c399c175-e5bf-4e20-8744-79884257a410');
-- 3.  alinda · Leros · beach
select public.fold_canonical('9666d3d8-afc1-458d-a51f-93f4bed9b3ef','2c25cf22-755a-48c4-aa7e-9a3101fee964');
-- 4.  avoriaz 1800 · Haute-Savoie · ski resort
select public.fold_canonical('d91c4eb8-7f41-4a02-807d-3beed5aa4846','b8ac816a-b75a-4fc4-9337-bbf42be3f8c9');
-- 5.  mylos by the sea · Leros (keeps "seafood restaurant" over "restaurant")
select public.fold_canonical('fa62f220-0d16-4b06-b5f9-ffdaa146a2e8','9e66b2da-ab22-4a1d-bc01-38122b3e70d2');
-- 6.  the castel above panteli · Leros
select public.fold_canonical('a1049909-2188-4bef-844e-5a5e945f91f0','f1918f8d-1cec-4d93-9d5b-921bb9a29731');
-- 7.  the cherry orchard · play
select public.fold_canonical('e0221e09-e2d7-4d7a-99a4-cfc461cd0f40','98ec3c45-aaab-4424-ba0d-cfc3d33bcee2');
-- 8.  the israel museum
select public.fold_canonical('3b197ffa-32bd-4627-b709-306dde988f2d','30be9a83-56e2-4c32-a2c0-0b63943c76e8');
-- 9.  war and peace · novel
select public.fold_canonical('c0c657ce-9d68-4da8-aa84-d265acbb352a','5afe1cf3-95ba-4563-8020-e758bc9769c7');
-- 10. "yes in shevach street 34 tel aviv" — Tel Aviv inside Tel Aviv, Israel
select public.fold_canonical('701a0deb-66a4-426d-b6d1-169ea2844c7e','e47b14a3-bfc5-4840-ba80-c9d1e925a07b');
-- 11. אבו חסן — יפו is inside תל אביב-יפו; keeps the row that has a kind
select public.fold_canonical('793e9278-f440-42b3-b7de-bbc76a7f3af9','dd71a309-dc7f-4da4-a9e4-d7aa9deb39cf');
-- 12. בית ספר אלחריזי · Tel Aviv
select public.fold_canonical('47f7c7a1-2256-4ce7-9731-71c562535a06','05fb445e-ac4a-4348-b381-9b041287322b');
-- 13. רומן טמיר — גבעתיים inside גבעתיים, ישראל; keeps the dermatologist kind
select public.fold_canonical('26de7a71-ba7b-49d5-97dc-ef82fee8338b','ffff180e-147e-42fa-b6bb-ade823851b96');
-- 14. שושן שמוליק · גאולה (both carry the same phone key)
select public.fold_canonical('50de4871-25c1-424f-9bb0-19dfd7f72e3b','d3a8dfd0-fd86-4d3b-8aff-06ccafba1410');
-- 15. Tony Vespa · Indianapolis — folds the three classifier attempts at one
--     man into one row, so the junk delete below removes one row, not three.
select public.fold_canonical('68058b24-f55c-4118-b22c-a433a632ce32','add27637-a9b2-4dd7-bd31-9b9d1404567f');
-- 16.
select public.fold_canonical('68058b24-f55c-4118-b22c-a433a632ce32','3ffe2766-6e43-4923-9e68-e0db1d5a23c5');

-- 17. air b&b — dan, 15 Sep: "should be there once but should come up when
--     searching bari or apulia. The system got it half right."
--     The surviving row already says both: its location is "Bari Italy" and its
--     tags say "Apulia Italy ... Bari". The other knows only Apulia. Folding
--     into the Bari row therefore loses nothing and keeps both search terms.
select public.fold_canonical('26f56dd6-bd69-49bb-8a40-7185c241c694','2200f590-3529-4e25-9c34-a4863473e6c7');

-- 18. Carry across the only words the folded row had that the survivor lacked,
--     and clear search_doc_at so the librarian re-embeds it with them.
update public.canonicals
   set search_doc = search_doc || ' vacation rental stay accommodation platform',
       search_doc_at = null,
       updated_at = now()
 where id = '26f56dd6-bd69-49bb-8a40-7185c241c694'
   and search_doc is not null
   and position('vacation rental' in search_doc) = 0;

-- 19. THE JUNK. Three canonicals invented on 6 Jul 2026 by the unanchored
--     enricher, from a query about pizza in Tel Aviv: a technology consultant
--     in Indianapolis. dan, 15 Sep: "what has Indianapolis got to do with it
--     and what has consultants got to do with it — you can remove it
--     permanently", and confirmed the recommendations hanging off them are junk
--     too. recommendations.canonical_id is ON DELETE CASCADE, so those four
--     rows and two suggestions go with it, which is the intent.
--     Step 15 and 16 have already folded the other two into this one.
delete from public.canonicals
 where id = '68058b24-f55c-4118-b22c-a433a632ce32'
   and location = 'Indianapolis, United States';

-- 20. The empty husks: no location, no kind, and nothing anywhere points at
--     them. Not duplicates to fold — rows to remove. Guarded so this cannot
--     delete anything that has acquired a reference since.
delete from public.canonicals c
 where c.id in ('e7d4e878-f4b5-4766-a13a-8b145ba53b13',   -- "Tony vespa"
                '4221de19-840c-412f-b4ea-9cd4c6275e26',   -- "art pizza"
                '81babc34-3e97-447d-8e34-79b7ed0405cf')   -- "k2"
   and coalesce(c.location,'') = ''
   and c.kind is null
   and not exists (select 1 from public.recommendations r where r.canonical_id = c.id)
   and not exists (select 1 from public.query_responses q where q.canonical_id = c.id)
   and not exists (select 1 from public.suggestions s where s.canonical_id = c.id);

-- 21. Verify. Collision groups should fall from 18 to 3 — ROK, which needs a
--     human to say whether רחוב כורזים 5 is in רמת גן, and the two art pizza /
--     tony vespa groups that no longer collide because the junk is gone.
select (select count(*) from public.canonicals where merged_into is null) as live_canonicals,
       (select count(*) from (select public.norm_name(name)
                                from public.canonicals where merged_into is null
                               group by 1 having count(*) > 1) g) as collision_groups,
       (select count(*) from (select owner_id, canonical_id
                                from public.recommendations
                               group by 1,2 having count(*) > 1) d) as owners_with_duplicate_rows;
