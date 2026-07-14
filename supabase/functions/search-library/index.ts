// ============================================================================
// POST /functions/v1/search-library
// Semantic search over the caller's OWN library: embeds the query
// (Hebrew or English) and matches by meaning against item vectors.
// Auth: caller JWT. Requires secret: OPENAI_API_KEY
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

interface Body { q: string; }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ ids: [], skipped: true });

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const q = (body.q || "").trim();
  if (q.length < 2) return json({ ids: [] });

  // 1. Embed the query
  let embedding: number[] | null = null;
  try {
    const emb = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        dimensions: 1536,
        input: q,
      }),
    });
    if (emb.ok) {
      const e = await emb.json();
      embedding = e.data?.[0]?.embedding ?? null;
    }
  } catch (_) { /* fall through */ }
  if (!embedding) return json({ ids: [] });

  // 2. Match against the caller's own recommendations
  const admin = adminClient();
  const { data, error } = await admin.rpc("match_user_recs", {
    p_user: userId,
    p_embedding: embedding,
    p_limit: 12,
  });
  if (error) return json({ ids: [], error: error.message });

  // Similarity floor: below this, a "nearest" item is noise, not a match.
  // Tunable without redeploy: supabase secrets set SEARCH_MIN_SIMILARITY=0.35
  const MIN_SIMILARITY = parseFloat(Deno.env.get("SEARCH_MIN_SIMILARITY") ?? "0.3");
  const hits = (data || []).filter((r: { similarity: number }) => r.similarity >= MIN_SIMILARITY);

  return json({
    ids: hits.map((r: { rec_id: string }) => r.rec_id),
    scores: hits.map((r: { rec_id: string; similarity: number }) => ({
      rec_id: r.rec_id, similarity: Math.round(r.similarity * 100) / 100,
    })),
  });
});
