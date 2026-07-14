// ============================================================================
// POST /functions/v1/check-similar-query
// Body: { query_text, circle_id }
// Returns whether any linked member of this circle has recently sent a similar
// query to a circle that includes the caller. Informational heads-up only.
// ============================================================================
import {
  adminClient, userClient, getUserId, json, err, handleOptions, jaccard,
} from "../_shared/utils.ts";

interface Body { query_text: string; circle_id: string; }

const SIMILARITY_THRESHOLD = 0.4;
const WINDOW_DAYS = 14;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  if (!body.query_text?.trim() || !body.circle_id) return err("query_text and circle_id required");

  const supa = userClient(req);
  const admin = adminClient();

  // 1. Linked members of this circle
  const { data: members } = await supa
    .from("members").select("linked_user_id")
    .eq("circle_id", body.circle_id)
    .not("linked_user_id", "is", null);
  const linkedIds = (members ?? []).map((m) => m.linked_user_id).filter(Boolean);
  if (linkedIds.length === 0) return json({ duplicate: false });

  // 2. Recent queries by those members
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const { data: candidates } = await admin
    .from("queries")
    .select("text, sent_at, sent_by, circle_id, users!queries_sent_by_fkey(name)")
    .in("sent_by", linkedIds)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false });

  if (!candidates || candidates.length === 0) return json({ duplicate: false });

  // 3. Filter to queries whose target circle includes the caller, then score
  for (const c of candidates) {
    const { data: inCircle } = await admin
      .from("members").select("id")
      .eq("circle_id", c.circle_id)
      .eq("linked_user_id", userId)
      .limit(1);
    if (!inCircle || inCircle.length === 0) continue;

    const score = jaccard(body.query_text, c.text);
    if (score >= SIMILARITY_THRESHOLD) {
      // deno-lint-ignore no-explicit-any
      const senderName = (c as any).users?.name ?? "Someone in this circle";
      return json({
        duplicate: true,
        sender_name: senderName,
        query_text: c.text,
        sent_at: c.sent_at,
        similarity: Math.round(score * 100) / 100,
      });
    }
  }
  return json({ duplicate: false });
});
