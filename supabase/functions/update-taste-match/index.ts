// ============================================================================
// POST /functions/v1/update-taste-match
// Nightly cron. Rebuilds taste_match_profiles and taste_matches for all users.
// Auth: CRON_SECRET in the x-cron-secret header (service role internally).
// Excludes reciprocal-circle pairs to avoid contaminated similarity.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

const SIMILARITY_THRESHOLD = 0.65;
const MAX_MATCHES_PER_USER = 5;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return err("forbidden", 403);
  }

  const admin = adminClient();

  // 1. Build per-user category vectors and tag fingerprints
  const { data: recs } = await admin
    .from("recommendations")
    .select("owner_id, tags, canonical_id, canonicals(category)");
  if (!recs) return err("no_data", 500);

  const profiles = new Map<string, { cats: Record<string, number>; tags: Record<string, number> }>();
  for (const r of recs) {
    const p = profiles.get(r.owner_id) ?? { cats: {}, tags: {} };
    // deno-lint-ignore no-explicit-any
    const cat = (r as any).canonicals?.category;
    if (cat) p.cats[cat] = (p.cats[cat] ?? 0) + 1;
    for (const t of r.tags ?? []) p.tags[t] = (p.tags[t] ?? 0) + 1;
    profiles.set(r.owner_id, p);
  }

  // 2. Upsert taste_match_profiles
  for (const [userId, p] of profiles) {
    const topTags = Object.entries(p.tags)
      .sort((a, b) => b[1] - a[1]).slice(0, 50).map(([t]) => t);
    await admin.from("taste_match_profiles").upsert({
      user_id: userId, category_vector: p.cats, tag_fingerprint: topTags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  // 3. Reciprocal pairs to exclude
  const reciprocal = await loadReciprocalPairs(admin);

  // 4. Pairwise cosine similarity on category vectors
  const userIds = [...profiles.keys()];
  const matches: { user_id: string; matched_user_id: string; score: number }[] = [];
  for (let i = 0; i < userIds.length; i++) {
    for (let j = i + 1; j < userIds.length; j++) {
      const a = userIds[i], b = userIds[j];
      if (reciprocal.has(pairKey(a, b))) continue;
      const score = cosine(profiles.get(a)!.cats, profiles.get(b)!.cats);
      if (score >= SIMILARITY_THRESHOLD) {
        matches.push({ user_id: a, matched_user_id: b, score });
        matches.push({ user_id: b, matched_user_id: a, score });
      }
    }
  }

  // 5. Keep top N per user, replace taste_matches
  await admin.from("taste_matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const byUser = new Map<string, typeof matches>();
  for (const m of matches) {
    const arr = byUser.get(m.user_id) ?? [];
    arr.push(m); byUser.set(m.user_id, arr);
  }
  const toInsert: typeof matches = [];
  for (const arr of byUser.values()) {
    arr.sort((x, y) => y.score - x.score);
    toInsert.push(...arr.slice(0, MAX_MATCHES_PER_USER));
  }
  if (toInsert.length) await admin.from("taste_matches").insert(toInsert);

  return json({ profiles: profiles.size, matches: toInsert.length });
});

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function loadReciprocalPairs(admin: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const { data } = await admin
    .from("members")
    .select("owner_id, linked_user_id, circles(domain)")
    .not("linked_user_id", "is", null);
  const edges = new Map<string, Set<string>>();
  for (const m of data ?? []) {
    // deno-lint-ignore no-explicit-any
    const domain = (m as any).circles?.domain;
    if (!domain) continue;
    const key = `${m.owner_id}|${domain}`;
    const set = edges.get(key) ?? new Set<string>();
    set.add(m.linked_user_id as string);
    edges.set(key, set);
  }
  const reciprocal = new Set<string>();
  for (const [key, linked] of edges) {
    const [owner, domain] = key.split("|");
    for (const other of linked) {
      const otherSet = edges.get(`${other}|${domain}`);
      if (otherSet && otherSet.has(owner)) reciprocal.add(pairKey(owner, other));
    }
  }
  return reciprocal;
}

function cosine(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const va = a[k] ?? 0, vb = b[k] ?? 0;
    dot += va * vb; na += va * va; nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
