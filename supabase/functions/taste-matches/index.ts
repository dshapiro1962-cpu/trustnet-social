// ============================================================================
// GET /functions/v1/taste-matches
// Returns anonymised recommendations from the caller's matched users.
// NEVER returns matched_user_id, names, or any identifying info.
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const admin = adminClient();

  // 1. The caller's matched users + scores
  const { data: tm } = await admin
    .from("taste_matches").select("matched_user_id, score")
    .eq("user_id", userId).order("score", { ascending: false });
  if (!tm || tm.length === 0) return json({ matches: [] });

  const matchedIds = tm.map((m) => m.matched_user_id);
  const scoreById = new Map<string, number>(tm.map((m) => [m.matched_user_id, Number(m.score)]));

  // 2. Pull a few highly-rated recs from each matched user (service role)
  const { data: recs } = await admin
    .from("recommendations")
    .select("owner_id, note, rating, tags, canonicals(name, category, location, image_emoji)")
    .in("owner_id", matchedIds)
    .gte("rating", 4)
    .order("rating", { ascending: false })
    .limit(20);

  // 3. Strip every identifier; attach only the match score
  const out = (recs ?? []).map((r) => ({
    match_score: Math.round((scoreById.get(r.owner_id) ?? 0) * 100),
    // deno-lint-ignore no-explicit-any
    canonical: (r as any).canonicals,
    note: r.note,
    rating: r.rating,
    tags: r.tags,
  }));

  out.sort((a, b) => b.match_score - a.match_score);
  return json({ matches: out.slice(0, 10) });
});
