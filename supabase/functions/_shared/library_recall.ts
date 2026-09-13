// ============================================================================
// library_recall.ts — "what in MY library relates to this?", once.
//
// WHY THIS EXISTS. There were two answers to that question in this codebase and
// only one of them was ever fixed.
//
//   14 Jul  v0.16.1  match_user_recs (vector only, no threshold) is created,
//                    and build-sheet calls it.
//   28 Jul  v0.25.0  "Librarian: search documents, hybrid retrieval + rerank,
//                    eval harness" replaces that approach with
//                    search_library_hybrid + an intent rerank — in
//                    search-library. It does not touch build-sheet.
//
// build-sheet kept the July mechanism for nine weeks. `git log -S match_user_recs
// -- supabase/functions/build-sheet/index.ts` returns exactly one commit: the
// initial one. The eval that proved the fix (eval/eval-retrieval.js) posts only
// to /search-library, so nothing ever measured the sheet.
//
// WHAT WENT WRONG IN THE OLD PATH, measured on dan's real library 12 Sep 2026:
// vector-only similarity over a bilingual library is dominated by LANGUAGE, not
// meaning.
//
//     Hebrew <-> Hebrew   mean 0.354      Latin <-> Latin   mean 0.264
//     Hebrew <-> Latin    mean 0.191
//
// The old threshold was max(0.25, SEARCH_MIN_SIMILARITY - 0.05) = 0.25, i.e.
// BELOW the baseline similarity of two unrelated Hebrew items. A Hebrew question
// about hotels in Apulia therefore retrieved a vet, an exterminator and a
// driving instructor — for being Hebrew — while the Italian restaurants in the
// same library, written in Latin script, scored 0.191 and were excluded for
// being in the wrong alphabet. No single cosine threshold separates those two
// populations, which is why this is a mechanism change and not a tuning change.
//
// The hybrid blends trigram keyword evidence with the vector, so proper nouns
// and short texts — exactly what recommendations are — carry weight that
// language similarity cannot fake.
//
// Secrets: OPENAI_API_KEY (the caller passes it; without it this returns []).
// ============================================================================
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface LibraryHit {
  rec_id: string;
  canonical_id: string;
  name: string;
  location: string;
  primary_category: string;
  ai_tags: string[];
  search_doc: string;
  note: string;
  rating: number;
  vec_sim: number;
  kw_sim: number;
  score: number;
  why: string;
}

export interface RecallResult {
  hits: LibraryHit[];
  /** null when recall completed normally; set when it could not be judged. */
  error: string | null;
}

const RERANK_MODEL = () => Deno.env.get("RERANK_MODEL") ?? "gpt-4o";

/**
 * Find the items in one person's library that genuinely relate to `queryText`.
 *
 * FAILS CLOSED. Every failure path returns an EMPTY list with `error` set, and
 * callers must show nothing rather than everything. The old build-sheet code
 * did the opposite: five separate paths marked every candidate relevant when
 * the judge was unavailable, so an OpenAI blip pasted an unfiltered library
 * into the answer sheet. Showing a vet under a question about Bari is worse
 * than showing nothing, and the caller can say why it is empty.
 */
export async function libraryRecall(
  admin: SupabaseClient,
  key: string | undefined,
  userId: string,
  queryText: string,
  limit = 10,
): Promise<RecallResult> {
  const q = String(queryText || "").trim();
  if (!q) return { hits: [], error: null };
  if (!key) return { hits: [], error: "openai_not_configured" };

  // 1 ── embed the question. Without a vector the hybrid still runs on its
  // keyword arm alone, which is markedly weaker (measured: "recommend me a
  // good read" ranks a battery company first on trigrams), so a failure here
  // is reported rather than silently degraded.
  let vector: number[] | null = null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-large", dimensions: 1536, input: q }),
    });
    if (r.ok) { const e = await r.json(); vector = e.data?.[0]?.embedding ?? null; }
  } catch (_) { /* reported below */ }
  if (!vector) return { hits: [], error: "embedding_unavailable" };

  // 2 ── hybrid recall: trigram keyword ∪ vector, a wide slice for the rerank.
  const { data, error } = await admin.rpc("search_library_hybrid", {
    p_user: userId, p_embedding: vector, p_query: q, p_limit: 30,
  });
  if (error) return { hits: [], error: "hybrid_rpc_failed: " + error.message };
  let candidates = (data ?? []) as LibraryHit[];
  if (!candidates.length) return { hits: [], error: null };

  // ONE ROW PER THING. search_library_hybrid joins recommendations to
  // canonicals and returns a row per RECOMMENDATION, so an item held several
  // times fills several slots with identical scores. On dan's library that is
  // 128 rows over 88 distinct names — "עליזה" alone occupies seven, and four
  // copies of one exterminator crowded out everything else.
  const seen = new Set<string>();
  candidates = candidates.filter((c) => {
    const k = c.canonical_id || c.rec_id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 3 ── rerank for INTENT. A blend of scores cannot tell that "resort for
  // children" means family-suitable, and it cannot read provenance. The
  // catalogue document records the question an item was saved in answer to
  // ("asked: ..."), which is how the library remembers the conversation and
  // not merely the thing.
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL(), temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            'Someone asked their trusted circle: "' + q.slice(0, 200) + '". ' +
            "You get entries from THEIR OWN library (index + catalogue text). Return JSON only: " +
            '{"results":[{"i":<index>,"why":"<=8 words why it fits"}]} — ' +
            "ONLY entries that genuinely relate to that question, best first, at most " + limit + ". " +
            "Judge intent, not word overlap: a dermatologist does not answer a plumber question, " +
            "and a driving instructor does not answer a question about hotels in Italy. " +
            "IMPORTANT: an entry SAVED IN ANSWER TO a question mentioning the subject IS relevant, " +
            'even when it is not that subject itself. Entries note the question they answered ' +
            '("asked: ..."). ' +
            'If NOTHING fits, return {"results":[]} — an empty answer beats a wrong one. ' +
            "Entries may be Hebrew or English; do not treat two entries as related merely for " +
            "being written in the same language." },
          { role: "user", content: JSON.stringify(candidates.map((c, i) => ({
              i, text: String(c.search_doc || [c.name, c.location, c.note].filter(Boolean).join(" · ")).slice(0, 400),
            }))) },
        ],
      }),
    });
    if (!r.ok) return { hits: [], error: "openai_" + r.status };
    const c = await r.json();
    const p = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
    if (!Array.isArray(p.results)) return { hits: [], error: "unexpected_rerank_output" };
    const picked = p.results
      .filter((x: Record<string, unknown>) =>
        typeof x.i === "number" && x.i >= 0 && x.i < candidates.length)
      .slice(0, limit)
      .map((x: Record<string, unknown>) => ({
        ...candidates[x.i as number],
        why: String(x.why || "").slice(0, 60),
      }));
    return { hits: picked, error: null };
  } catch (e) {
    return { hits: [], error: "rerank_exception: " + String(e).slice(0, 120) };
  }
}
