// ============================================================================
// POST /functions/v1/resend-member            engine: resend-member-v1
// Re-attempts delivery of an existing query to ONE member.
// Optionally updates the member's contact to a new email first
// (the delivery strip's "add email + resend" fallback).
// Reuses the member's existing query_responses row + response token —
// never creates a duplicate response row.
// Auth: caller JWT; caller must own the query.
// Body: { query_id, member_id, email? }
// ============================================================================
import {
  adminClient, userClient, getUserId, json, err, handleOptions,
} from "../_shared/utils.ts";
import { sendWhatsApp, sendEmail, queryEmailHtml } from "../_shared/channels.ts";

const ENGINE = "resend-member-v1";
const WA_TEMPLATE = Deno.env.get("WA_TEMPLATE") ?? "trustnet_query_v1";

interface Body {
  query_id: string;
  member_id: string;
  email?: string;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("invalid_json");
  }
  if (!body.query_id || !body.member_id) return err("query_id and member_id required");

  const newEmail = body.email?.trim();
  if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return err("invalid_email");
  }

  const supa = userClient(req);   // RLS-scoped: proves caller owns these rows
  const admin = adminClient();

  // 1. Load the query (RLS ensures the caller owns it) + its circle
  const { data: query, error: qErr } = await supa
    .from("queries").select("*").eq("id", body.query_id).single();
  if (qErr || !query) return err("query_not_found", 404);
  if (query.sent_by !== userId) return err("not_query_owner", 403);

  const { data: circle, error: cErr } = await supa
    .from("circles").select("*").eq("id", query.circle_id).single();
  if (cErr || !circle) return err("circle_not_found", 404);

  // 2. Load the member (must belong to the query's circle)
  const { data: member, error: mErr } = await supa
    .from("members").select("*").eq("id", body.member_id).single();
  if (mErr || !member) return err("member_not_found", 404);
  if (member.circle_id !== query.circle_id) return err("member_not_in_circle", 400);

  // 3. Reuse the existing query_responses row (keeps the same response token)
  const { data: qr, error: qrErr } = await supa
    .from("query_responses").select("*")
    .eq("query_id", body.query_id).eq("member_id", body.member_id)
    .single();
  if (qrErr || !qr) return err("response_row_not_found", 404);
  if (qr.responded_at) return err("member_already_responded", 400);

  // 4. Optional contact switch: "add email + resend"
  let contactMethod = member.contact_method;
  let contactValue = member.contact_value;
  if (newEmail) {
    const { error: upErr } = await admin.from("members").update({
      contact_method: "email", contact_value: newEmail,
    }).eq("id", member.id);
    if (upErr) return err(`member_update_failed: ${upErr.message}`, 500);
    contactMethod = "email";
    contactValue = newEmail;
  }

  // 5. Caller profile for personalisation
  const { data: me } = await supa.from("users").select("name").eq("id", userId).single();
  const requesterName = me?.name ?? "Someone";

  const appUrl = Deno.env.get("RESPONSE_FORM_BASE_URL") ?? "https://app.trustnet.com/respond";
  const responseUrl = `${appUrl}?t=${qr.response_token}`;

  // 6. Re-attempt delivery on the (possibly new) channel
  let result: { ok: boolean; error?: string } = { ok: false, error: "unsupported_channel" };
  if (contactMethod === "email" && contactValue) {
    result = await sendEmail(
      contactValue,
      `${requesterName} is asking their ${circle.name} circle`,
      queryEmailHtml({ requesterName, queryText: query.text, responseUrl, circleName: circle.name }),
    );
  } else if (contactMethod === "whatsapp" && contactValue) {
    result = await sendWhatsApp(contactValue, WA_TEMPLATE, [
      requesterName, query.text, responseUrl,
    ]);
  } else if (contactMethod === "app" && member.linked_user_id && member.linked_user_id !== userId) {
    const { error: nErr } = await admin.from("notifications").insert({
      user_id: member.linked_user_id, type: "query",
      title: `${requesterName} is asking their ${circle.name} circle`,
      body: query.text, query_id: query.id,
      response_token: qr.response_token, circle_id: circle.id, actor_name: requesterName,
    });
    result = nErr ? { ok: false, error: nErr.message } : { ok: true };
  }

  await admin.from("query_responses").update({
    send_status: result.ok ? "sent" : "failed",
    send_error: result.ok ? null : (result.error ?? "unknown"),
  }).eq("response_token", qr.response_token);

  if (!result.ok) {
    console.error("resend_failed", member.name, result.error);
    return json({
      engine: ENGINE, ok: false, member_id: member.id, member: member.name,
      channel: contactMethod, status: "failed", error: result.error ?? "unknown",
    });
  }

  return json({
    engine: ENGINE, ok: true, member_id: member.id, member: member.name,
    channel: contactMethod, status: "sent", error: null,
  });
});
