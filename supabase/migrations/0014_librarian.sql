-- ============================================================================
-- 0014_librarian.sql — the memory layer's foundation
--
-- WHY: retrieval was vector-only over a thin string (name|location|note|tags).
-- "Avoriaz 1800" saved from a ski circle contained the word "ski" NOWHERE, so
-- "good ski resort for children" could never match it. Vectors are also weak on
-- proper nouns, which is exactly what recommendations are made of.
--
-- WHAT: every canonical gets a SEARCH DOCUMENT — name, location, category,
-- tags, the question it answered, the circle it came from — and retrieval
-- becomes HYBRID: trigram keyword matching UNION vector similarity.
-- ============================================================================

-- 1 ── the search document + its embedding ----------------------------------
alter table canonicals add column if not exists search_doc text;
alter table canonicals add column if not exists search_doc_at timestamptz;

-- 2 ── trigram keyword matching (proper nouns, Hebrew, partial words) --------
create extension if not exists pg_trgm;
create index if not exists canonicals_search_doc_trgm
  on canonicals using gin (search_doc gin_trgm_ops);

-- 3 ── hybrid retrieval -------------------------------------------------------
-- Returns each of the caller's recommendations with THREE scores:
--   vec_sim   : cosine similarity of the query embedding vs the item embedding
--   kw_sim    : trigram similarity of the raw query text vs the search document
--   score     : blended, keyword-weighted (proper nouns matter more than vibes)
-- The caller (search-library) reranks the top slice with an LLM.
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
    case when c.embedding is null then 0
         else 1 - (c.embedding <=> p_embedding) end as vec_sim,
    case when c.search_doc is null or p_query = '' then 0
         else similarity(c.search_doc, p_query) end as kw_sim,
    (
      0.55 * case when c.search_doc is null or p_query = '' then 0
                  else similarity(c.search_doc, p_query) end
      + 0.45 * case when c.embedding is null then 0
                    else 1 - (c.embedding <=> p_embedding) end
    ) as score
  from recommendations r
  join canonicals c on c.id = r.canonical_id
  where r.owner_id = p_user
  order by score desc
  limit p_limit;
$$;

-- 4 ── verification -----------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_name = 'canonicals' and column_name = 'search_doc') as has_search_doc,
  (select count(*) from pg_proc where proname = 'search_library_hybrid') as has_hybrid_rpc,
  (select count(*) from pg_indexes where indexname = 'canonicals_search_doc_trgm') as has_trgm_index;
