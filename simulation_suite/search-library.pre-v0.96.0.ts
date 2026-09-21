// ============================================================================
// POST /functions/v1/search-library                engine: search-v1
//
// HYBRID retrieval over the Librarian's search documents, then an LLM rerank.
//
// Why hybrid: vectors alone are weak on proper nouns ("Avoriaz") and short
// texts — exactly what recommendations are. Trigram keyword matching is strong
// there and weak on meaning. Blended, they cover each other; the rerank then
// judges INTENT ("for children" must actually mean family-suitable).
//
// { query, limit? }  ->  { items:[{rec_id, name, location, category, tags,
//                          note, rating, score, why}], engine, reranked }
// Auth: caller JWT. Secrets: OPENAI_API_KEY
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";
import { norm } from "../_shared/enrich_core.ts";

const ENGINE = "search-v1";
const RERANK_MODEL = () => Deno.env.get("RERANK_MODEL") ?? "gpt-4o";

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const query = String(body.query || body.q || "").trim();  // `q` = legacy app contract
  if (!query) return err("query_required");
  const limit = Math.min(Number(body.limit) || 10, 25);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return err("openai_key_missing", 500);
  const admin = adminClient();

  // 1 ── embed the question
  let vector: number[] | null = null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-large", dimensions: 1536, input: query }),
    });
    if (r.ok) { const e = await r.json(); vector = e.data?.[0]?.embedding ?? null; }
  } catch (_) { /* keyword-only fallback below */ }

  // 2 ── hybrid recall (keyword ∪ vector), wide slice for the reranker
  const { data: hits, error: rpcErr } = await admin.rpc("search_library_hybrid", {
    p_user: userId,
    p_embedding: vector,
    p_query: query,
    p_limit: 30,
  });
  if (rpcErr) return err("hybrid_rpc_failed: " + rpcErr.message, 500);
  const candidates = (hits || []) as Array<Record<string, unknown>>;
  if (!candidates.length) return json({ engine: ENGINE, reranked: false, ids: [], items: [] });

  // 3 ── rerank for INTENT (the part a blend of scores cannot judge)
  let order: { i: number; why: string }[] | null = null;
  let rerankError: string | null = null;
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "Someone is searching their OWN library of trusted recommendations for: \"" +
            query.slice(0, 200) + "\". " +
            "You get candidate entries (index + catalogue text). Return JSON only: " +
            '{"results":[{"i":<index>,"why":"<=8 words why it fits"}]} — ' +
            "ONLY entries that genuinely answer the search, best first, at most " + limit + ". " +
            "Judge intent, not word overlap: \"resort for children\" needs family suitability, " +
            "not merely the word children; a dermatologist does not answer a plumber search. " +
            "IMPORTANT: an entry that was SAVED IN ANSWER TO a question mentioning the search " +
            "term IS relevant, even though it is not that term itself. Entries note the question " +
            "they answered (\"asked: ...\"). Searching \"la grave\" must therefore return the " +
            "resorts a circle recommended as similar to La Grave; searching \"santorini\" must " +
            "return the alternatives suggested. The library remembers the CONVERSATION, not just " +
            "the thing. " +
            "If NOTHING fits, return {\"results\":[]} — an empty answer beats a wrong one. " +
            "Entries may be Hebrew or English." },
          { role: "user", content: JSON.stringify(candidates.map((c, i) => ({
              i, text: String(c.search_doc || [c.name, c.location, c.note].filter(Boolean).join(" · ")).slice(0, 400),
            }))) },
        ],
      }),
    });
    if (r.ok) {
      const c = await r.json();
      const p = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
      if (Array.isArray(p.results)) {
        order = p.results
          .filter((x: Record<string, unknown>) => typeof x.i === "number" && x.i >= 0 && x.i < candidates.length)
          .map((x: Record<string, unknown>) => ({ i: x.i as number, why: String(x.why || "").slice(0, 60) }));
      } else {
        rerankError = "unexpected_rerank_output";
      }
    } else {
      rerankError = "openai_" + r.status;
    }
  } catch (e) {
    rerankError = "rerank_exception: " + String(e).slice(0, 120);
  }

  let pick = order
    ? order.map((o) => ({ c: candidates[o.i], why: o.why }))
    : candidates.slice(0, limit).map((c) => ({ c, why: "" })); // graceful: blended order

  // NEVER hand back a blank screen when the user typed the NAME of something
  // they actually have. That is the one case where an empty result is a bug
  // rather than an answer - and it is the only case.
  //
  // WAS: a blanket net over `kw_sim >= 0.4 || vec_sim >= 0.45`, labelled
  // "closest match in your library". kw_sim is similarity(search_doc, query)
  // over the WHOLE catalogue document, so a note reading "great archeology"
  // answered a search for "greta" at 0.500 while the vector arm - which was
  // right - scored it 0.139. The Israel Museum came back as the closest match
  // for a name that is not in the library at all. Measured on production,
  // 24 Aug 2026.
  //
  // Worse, it could only ever fire when the reranker was RIGHT. If the rerank
  // fails, `order` is null and `pick` is already the blended top-N; if there
  // are no candidates the function has already returned. So the sole reachable
  // trigger was the model obeying the instruction fifteen lines above - "If
  // NOTHING fits, return {\"results\":[]} - an empty answer beats a wrong one"
  // - and this overrode that verdict every single time.
  //
  // The net now matches the NAME, and only by whole-word containment. No fuzzy
  // scoring: fuzzy scoring is what produced the bug. The accepted cost is that
  // a misspelled name ("hakosm") returns nothing - a failure the user can see
  // and fix in a second, unlike a confident wrong answer.
  let fellBack = false;
  if (!pick.length) {
    const q = norm(query);
    const named = candidates.filter((c) => {
      const n = norm(String(c.name || ""));
      if (!n || !q) return false;
      if (n === q) return true;
      // Whole words both ways: "hakosem" finds "Hakosem Falafel", and
      // "hakosem falafel" still finds the row named "Hakosem". Padding is what
      // stops a canonical named "a" from answering every search.
      return (" " + n + " ").includes(" " + q + " ")
          || (" " + q + " ").includes(" " + n + " ");
    });
    if (named.length) {
      fellBack = true;
      pick = named.slice(0, limit).map((c) => ({ c, why: "in your library by name" }));
    }
  }

  return json({
    engine: ENGINE,
    reranked: !!order && !fellBack,
    fell_back: fellBack,
    rerank_error: rerankError,
    // `ids` keeps the legacy contract alive AND carries the ranked order.
    ids: pick.map(({ c }) => c.rec_id),
    items: pick.map(({ c, why }) => ({
      rec_id: c.rec_id, canonical_id: c.canonical_id,
      name: c.name, location: c.location,
      category: c.primary_category, tags: c.ai_tags,
      note: c.note, rating: c.rating,
      score: c.score, vec_sim: c.vec_sim, kw_sim: c.kw_sim,
      why,
    })),
  });
});
