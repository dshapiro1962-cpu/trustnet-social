-- ═══════════════════════════════════════════════════════════════════════════
-- 0042 · IDENTITY BACKFILL
--
-- 0041 changes every future write. This changes what is already there.
-- Nothing here merges a guess: 4 and 5 fold only rows that are the same thing
-- by the two silent tiers, and 9 asks about everything else instead of
-- deciding it.
--
-- RUN 0041 FIRST, AND RUN THESE ONE AT A TIME.
-- 1, 2, 3, 8 and 10 are read-only. Read 1 and 2 before running 4.
-- Every statement is idempotent: run any of them twice and the second run
-- changes nothing. Verified with simulation_suite/sql-editor-runner.sh.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · PREVIEW · the clusters statement 4 will fold ────────────────────
-- Expected on 22 Aug data: 10 clusters, 22 rows becoming 10.
select public.norm_name(name) as normalised,
       count(*) as rows_in_cluster,
       string_agg(name, ' | ' order by created_at) as names
  from public.canonicals
 where merged_into is null
 group by 1
having count(*) > 1
 order by rows_in_cluster desc, normalised;

-- ─── 2 · PREVIEW · the phone groups statement 5 will fold ────────────────
select phone_key,
       count(*) as rows_in_group,
       string_agg(name, ' | ' order by created_at) as names
  from public.canonicals
 where merged_into is null and phone_key is not null and length(phone_key) >= 9
 group by 1
having count(*) > 1
 order by rows_in_group desc;

-- ─── 3 · PREVIEW · the totals ────────────────────────────────────────────
select count(*) as live_canonicals,
       count(distinct public.norm_name(name)) as distinct_names,
       count(*) - count(distinct public.norm_name(name)) as rows_that_will_fold
  from public.canonicals
 where merged_into is null;

-- ─── 4 · FOLD · tier 1, normalised-exact ─────────────────────────────────
-- The head is the RICHEST row, not simply the oldest. Folding a row that has
-- a kind into one that does not would leave the surviving canonical
-- unenriched, and gate 2 drops unenriched items: the merge would silently
-- stop the item reaching anyone. Age only breaks the tie.
update public.canonicals c
   set merged_into = h.id
  from (select distinct on (public.norm_name(name))
               id, public.norm_name(name) as n
          from public.canonicals
         where merged_into is null
         order by public.norm_name(name),
                  (kind is null), (search_doc is null), (phone is null),
                  created_at asc, id asc) h
 where c.merged_into is null
   and c.id <> h.id
   and public.norm_name(c.name) = h.n;

-- ─── 5 · FOLD · tier 2, a matching phone ─────────────────────────────────
-- The same rule as 0041's tier 2, applied to what is already there. Without
-- this statement a phone-identical pair whose names differ is asked about as
-- if it were a guess.
update public.canonicals c
   set merged_into = h.id
  from (select distinct on (phone_key) id, phone_key
          from public.canonicals
         where merged_into is null and phone_key is not null and length(phone_key) >= 9
         order by phone_key,
                  (kind is null), (search_doc is null),
                  created_at asc, id asc) h
 where c.merged_into is null
   and c.phone_key = h.phone_key
   and c.id <> h.id
   and length(c.phone_key) >= 9;

-- ─── 6 · PROMOTE · nothing a folded row knew is lost ─────────────────────
-- Whichever row became the head, every non-null field from the rows folded
-- into it is carried up where the head has none. This is what makes the
-- choice of head safe rather than merely lucky.
update public.canonicals h
   set kind             = coalesce(h.kind, s.kind),
       search_doc       = coalesce(h.search_doc, s.search_doc),
       primary_category = coalesce(h.primary_category, s.primary_category),
       -- ai_tags is text[]. array_agg of an array column is TWO-dimensional,
       -- so [1] returns one element rather than one row. It needs its own read.
       ai_tags          = coalesce(h.ai_tags,
                            (select c2.ai_tags from public.canonicals c2
                              where c2.merged_into is not null
                                and public.canonical_head(c2.id) = h.id
                                and c2.ai_tags is not null limit 1)),
       category         = coalesce(h.category, s.category),
       location         = coalesce(h.location, s.location),
       description      = coalesce(h.description, s.description),
       phone            = coalesce(h.phone, s.phone),
       updated_at       = now()
  from (select public.canonical_head(id) as head_id,
               (array_agg(kind)             filter (where kind is not null))[1]             as kind,
               (array_agg(search_doc)       filter (where search_doc is not null))[1]       as search_doc,
               (array_agg(primary_category) filter (where primary_category is not null))[1] as primary_category,
               (array_agg(category)         filter (where category is not null))[1]         as category,
               (array_agg(location)         filter (where location is not null))[1]         as location,
               (array_agg(description)      filter (where description is not null))[1]      as description,
               (array_agg(phone)            filter (where phone is not null))[1]            as phone
          from public.canonicals
         where merged_into is not null
         group by 1) s
 where h.id = s.head_id
   and (h.kind is null or h.search_doc is null or h.primary_category is null
        or h.ai_tags is null or h.category is null or h.location is null
        or h.description is null or h.phone is null);

-- ─── 7 · REPOINT · every recommendation onto the live row ────────────────
-- The update fires recs_point_at_head, so each move is written to
-- canonical_resolution_log as a 'redirect' and can be read back or undone.
update public.recommendations r
   set canonical_id = public.canonical_head(r.canonical_id)
 where public.canonical_head(r.canonical_id) is distinct from r.canonical_id;

-- ─── 8 · PREVIEW · the questions statement 9 will create ─────────────────
-- Expected on 22 Aug data: 4. If this returns sixty, stop and re-decide — a
-- queue that size should ask on write and never backfill.
select a.name as candidate, b.name as head,
       round(similarity(lower(a.name), lower(b.name))::numeric, 3) as score
  from public.canonicals a
  join public.canonicals b
    on a.merged_into is null and b.merged_into is null
   and public.norm_name(a.name) <> public.norm_name(b.name)
   and (a.created_at, a.id) > (b.created_at, b.id)
   and similarity(lower(a.name), lower(b.name)) > 0.45
   and (a.location is null or b.location is null
        or lower(a.location) = lower(b.location)
        or similarity(lower(a.location), lower(b.location)) > 0.4)
 order by score desc;

-- ─── 9 · ENQUEUE · the tier 3 questions. Folds nothing. ──────────────────
insert into public.canonical_fold_queue
  (candidate_id, head_id, candidate_norm, head_norm, score)
select a.id, b.id, public.norm_name(a.name), public.norm_name(b.name),
       round(similarity(lower(a.name), lower(b.name))::numeric, 3)
  from public.canonicals a
  join public.canonicals b
    on a.merged_into is null and b.merged_into is null
   and public.norm_name(a.name) <> public.norm_name(b.name)
   and (a.created_at, a.id) > (b.created_at, b.id)
   and similarity(lower(a.name), lower(b.name)) > 0.45
   and (a.location is null or b.location is null
        or lower(a.location) = lower(b.location)
        or similarity(lower(a.location), lower(b.location)) > 0.4)
 where not exists (
   select 1 from public.canonical_fold_queue q
    where q.status = 'kept_apart'
      and least(q.candidate_norm, q.head_norm)
          = least(public.norm_name(a.name), public.norm_name(b.name))
      and greatest(q.candidate_norm, q.head_norm)
          = greatest(public.norm_name(a.name), public.norm_name(b.name)))
    on conflict (candidate_id, head_id) do nothing;

-- ─── 10 · VERIFY ─────────────────────────────────────────────────────────
select (select count(*) from public.canonicals where merged_into is null)     as live_canonicals,
       (select count(*) from public.canonicals where merged_into is not null) as folded,
       (select count(*) from public.canonical_fold_queue where status = 'pending') as questions_waiting,
       (select count(*) from public.recommendations r
         join public.canonicals c on c.id = r.canonical_id
        where c.merged_into is not null)                                      as recs_on_a_tombstone,
       (select count(*) from public.canonicals
         where merged_into is null and kind is null)                          as live_without_kind;

-- recs_on_a_tombstone MUST be 0. If it is not, statement 7 did not run.
