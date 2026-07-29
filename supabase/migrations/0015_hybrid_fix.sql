-- ============================================================================
-- 0015_hybrid_fix.sql — the keyword half of hybrid search was dead on arrival.
--
-- WHY: 0014 scored keywords with similarity(search_doc, query). That compares
-- the ENTIRE document to the query, so a 3-word question against a 300-word
-- catalogue entry scores ~0.01 no matter how perfect the match. Live proof:
--     "ski" vs a ski-boot entry -> kw = 0.05
-- The 0.55 keyword weight was therefore contributing nothing and retrieval was
-- silently vector-only — the very failure the hybrid design existed to fix.
--
-- FIX: word_similarity(query, search_doc) asks the RIGHT question — "does the
-- query match some PORTION of this document" — which is what matching a short
-- query against a long entry actually means. Plus an exact-substring bonus so
-- a proper noun ("Avoriaz") beats fuzzy neighbours decisively.
-- ============================================================================

create index if not exists canonicals_search_doc_trgm_ops
  on canonicals using gin (search_doc gin_trgm_ops);

create or replace function search_library_hybrid(
  p_user uuid,
  p_embedding vector(1536),
  p_query text,
  p_limit int default 30
)
returns table (
  rec_id uuid,
  canonical_id uuid,
  name text,
  location text,
  primary_category text,
  ai_tags text[],
  search_doc text,
  note text,
  rating int,
  vec_sim float,
  kw_sim float,
  score float
)
language sql stable as $$
  with scored as (
    select
      r.id as rec_id,
      c.id as canonical_id,
      c.name,
      coalesce(c.location, '') as location,
      coalesce(c.primary_category, '') as primary_category,
      coalesce(c.ai_tags, '{}') as ai_tags,
      coalesce(c.search_doc, '') as search_doc,
      coalesce(r.note, '') as note,
      coalesce(r.rating, 0) as rating,
      case when c.embedding is null or p_embedding is null then 0
           else 1 - (c.embedding <=> p_embedding) end as vec_sim,
      -- how well does the query match SOME PART of the document
      case when c.search_doc is null or p_query = '' then 0
           else word_similarity(p_query, c.search_doc) end as word_sim,
      -- decisive bonus when the query (or the name) appears literally
      case
        when c.search_doc is not null and p_query <> ''
             and c.search_doc ilike '%' || p_query || '%' then 1.0
        when c.name is not null and p_query <> ''
             and (p_query ilike '%' || c.name || '%' or c.name ilike '%' || p_query || '%') then 0.9
        else 0
      end as exact_bonus
    from recommendations r
    join canonicals c on c.id = r.canonical_id
    where r.owner_id = p_user
  )
  select
    rec_id, canonical_id, name, location, primary_category, ai_tags,
    search_doc, note, rating, vec_sim,
    greatest(word_sim, exact_bonus) as kw_sim,
    (0.50 * greatest(word_sim, exact_bonus) + 0.50 * vec_sim) as score
  from scored
  order by score desc
  limit p_limit;
$$;

-- verification: on a library with a ski entry, "ski" should now score kw well
-- above the 0.05 the old function produced.
select
  (select count(*) from pg_proc where proname = 'search_library_hybrid') as rpc_exists,
  word_similarity('ski', 'K2 Sender · freeride ski · ski gear winter') as sample_word_sim,
  similarity('ski', 'K2 Sender · freeride ski · ski gear winter') as old_broken_sim;
