// ============================================================================
// POST /functions/v1/receive-response
// Public (token-authenticated). Called when a member submits the response form.
// No JWT required — the single-use response_token is the credential.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

interface Body {
  token: string;
  rec_name: string;
  rec_note?: string;
  rec_location?: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("invalid_json");
  }
  if (!body.token || !body.rec_name?.trim()) return err("token and rec_name required");

  const admin = adminClient();

  // 1. Look up the response row by token
  const { data: qr, error: qrErr } = await admin
    .from("query_responses").select("*").eq("response_token", body.token).single();
  if (qrErr || !qr) return err("invalid_token", 404);

  // 2. Validate token: not used, not expired
  if (qr.token_used) return err("token_already_used", 410);
  if (new Date(qr.token_expires_at) < new Date()) return err("token_expired", 410);

  // 3. Resolve the query + member for context
  const { data: query } = await admin
    .from("queries").select("*").eq("id", qr.query_id).single();
  const { data: member } = qr.member_id
    ? await admin.from("members").select("*").eq("id", qr.member_id).single()
    : { data: null };

  // 4. Canonical dedup — try to match an existing canonical, else create
  let canonicalId: string | null = null;
  const { data: matchId } = await admin.rpc("match_canonical", {
    p_name: body.rec_name.trim(),
    p_location: body.rec_location?.trim() ?? null,
  });
  if (matchId) {
    canonicalId = matchId as string;
  } else {
    const emoji = guessEmoji(body.rec_name, body.rec_location);
    const { data: newCan } = await admin.from("canonicals").insert({
      type: "place", name: body.rec_name.trim(),
      location: body.rec_location?.trim() ?? null,
      image_emoji: emoji, created_by: query?.sent_by ?? null,
    }).select("id").single();
    canonicalId = newCan?.id ?? null;
  }

  // 5. Update the response row
  await admin.from("query_responses").update({
    rec_name: body.rec_name.trim(),
    rec_note: body.rec_note?.trim() ?? null,
    rec_location: body.rec_location?.trim() ?? null,
    rec_emoji: guessEmoji(body.rec_name, body.rec_location),
    canonical_id: canonicalId,
    responded_at: new Date().toISOString(),
    token_used: true,
    send_status: "responded",
  }).eq("response_token", body.token);

  // 6. Notify the querying user (in-app) — real-time subscription also fires
  if (query) {
    await admin.from("notifications").insert({
      user_id: query.sent_by, type: "query_response",
      title: "New recommendation",
      body: `${member?.name ?? "Someone"} recommended ${body.rec_name.trim()}`,
      query_id: query.id,
      actor_name: member?.name ?? null,
    });
  }

  return json({ success: true });
});

function guessEmoji(name: string, location?: string): string {
  const s = (name + " " + (location ?? "")).toLowerCase();
  const map: [string, string][] = [
    ["restaurant", "🍽️"], ["cafe", "☕"], ["bar", "🍷"], ["wine", "🍷"],
    ["hotel", "🏨"], ["book", "📖"], ["film", "🎬"], ["movie", "🎬"],
    ["museum", "🏛️"], ["doctor", "👩‍⚕️"], ["dr ", "👩‍⚕️"], ["dr.", "👩‍⚕️"],
    ["dentist", "🦷"], ["gym", "🏋️"], ["plumber", "🔧"], ["clinic", "🏥"],
  ];
  for (const [k, e] of map) if (s.includes(k)) return e;
  return "📌";
}
