// ============================================================================
// GET /functions/v1/response-meta?t={token}
// Public. Returns minimal metadata so the response form can show the question.
// Reveals only: requester name, circle name, query text, expired/used flags.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const token = new URL(req.url).searchParams.get("t");
  if (!token) return err("token required");

  const admin = adminClient();
  const { data: qr } = await admin
    .from("query_responses")
    .select("token_used, token_expires_at, query_id")
    .eq("response_token", token).single();

  if (!qr) return json({ valid: false, used: true });

  const expired = new Date(qr.token_expires_at) < new Date();
  if (qr.token_used || expired) {
    return json({ valid: false, used: qr.token_used, expired });
  }

  const { data: q } = await admin
    .from("queries")
    .select("text, circle_id, sent_by, circles(name), users!queries_sent_by_fkey(name)")
    .eq("id", qr.query_id).single();

  return json({
    valid: true,
    used: false,
    expired: false,
    query_text: q?.text ?? "",
    // deno-lint-ignore no-explicit-any
    circle_name: (q as any)?.circles?.name ?? "",
    // deno-lint-ignore no-explicit-any
    requester_name: (q as any)?.users?.name ?? "Someone",
  });
});
