// ============================================================================
// POST /functions/v1/send-query               engine: send-query-v5-strip
// Routes a query to every member of a circle via their preferred channel.
// v5: per-member delivery results (feeds the app's delivery strip),
//     dual doorway (linked members ALSO get an in-app notification),
//     self-doorway guard (owner never notified about their own query),
//     WhatsApp template name switchable via WA_TEMPLATE secret.
// Auth: caller JWT. Writes query_responses + notifications via service role.
// ============================================================================
import {
  adminClient, userClient, getUserId, json, err, handleOptions, normalisedHash,
} from "../_shared/utils.ts";
import { sendWhatsApp, sendEmail, queryEmailHtml } from "../_shared/channels.ts";

const ENGINE = "send-query-v5-strip";
const WA_TEMPLATE = Deno.env.get("WA_TEMPLATE") ?? "trustnet_query_v1";

interface Body {
  query_id?: string;
  circle_id: string;
  text: string;
  degree?: 1 | 2;
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
  if (!body.circle_id || !body.text?.trim()) return err("circle_id and text required");

  const degree = body.degree === 2 ? 2 : 1;
  const appUrl = Deno.env.get("RESPONSE_FORM_BASE_URL") ?? "https://app.trustnet.com/respond";
  const supa = userClient(req);   // RLS-scoped reads for caller-owned data
  const admin = adminClient();    // cross-user writes

  // 1. Load circle (RLS ensures it belongs to caller)
  const { data: circle, error: cErr } = await supa
    .from("circles").select("*").eq("id", body.circle_id).single();
  if (cErr || !circle) return err("circle_not_found", 404);

  // 2. Load members of the circle (exclude external sources from messaging)
  const { data: members, error: mErr } = await supa
    .from("members").select("*").eq("circle_id", body.circle_id);
  if (mErr) return err("members_load_failed", 500);
  const reachable = (members ?? []).filter((m: any) => !m.is_external_source);
  if (reachable.length === 0) return err("circle_has_no_reachable_members");

  // 3. Caller profile (for message personalisation)
  const { data: me } = await supa.from("users").select("name").eq("id", userId).single();
  const requesterName = me?.name ?? "Someone";

  // 4. Create or update the query row
  const textHash = await normalisedHash(body.text);
  let queryId = body.query_id;
  if (queryId) {
    await supa.from("queries").update({
      status: "sent", sent_at: new Date().toISOString(), text_hash: textHash, degree,
    }).eq("id", queryId);
  } else {
    const { data: q, error: qErr } = await supa.from("queries").insert({
      circle_id: body.circle_id, sent_by: userId, text: body.text.trim(),
      text_hash: textHash, degree, status: "sent", sent_at: new Date().toISOString(),
    }).select("id").single();
    if (qErr || !q) return err("query_create_failed", 500);
    queryId = q.id;
  }

  // 5. Fan out to each member
  const channels = { app: 0, whatsapp: 0, email: 0, linkedin: 0 };
  const failures: { member: string; error: string }[] = [];
  const deliveries: {
    member_id: string; member: string; channel: string;
    status: "sent" | "failed"; error: string | null;
  }[] = [];
  let app_doorways = 0;
  const app_doorway_errors: { member: string; error: string }[] = [];

  // Helper: in-app doorway notification (used both as a primary channel
  // and as the second doorway for linked members on other channels).
  async function appDoorway(m: any, token: string): Promise<{ ok: boolean; error?: string }> {
    const { error: nErr } = await admin.from("notifications").insert({
      user_id: m.linked_user_id, type: "query",
      title: `${requesterName} is asking their ${circle.name} circle`,
      body: body.text.trim(), query_id: queryId,
      response_token: token, circle_id: circle.id, actor_name: requesterName,
    });
    if (nErr) {
      console.error("app_doorway_failed", m.name, nErr.message);
      return { ok: false, error: nErr.message };
    }
    return { ok: true };
  }

  for (const m of reachable) {
    const token = crypto.randomUUID();
    const responseUrl = `${appUrl}?t=${token}`;
    // Self-doorway guard: a member linked to the asker's own account never
    // gets notified about their own query.
    const linkedOther = !!m.linked_user_id && m.linked_user_id !== userId;

    await admin.from("query_responses").insert({
      query_id: queryId, member_id: m.id, response_token: token,
      degree, send_status: "pending",
    });

    let result: { ok: boolean; error?: string } = { ok: false, error: "unsupported_channel" };
    let channelUsed = m.contact_method ?? "unknown";

    if (m.contact_method === "app") {
      if (linkedOther) {
        result = await appDoorway(m, token);
        if (result.ok) { channels.app++; app_doorways++; }
        else app_doorway_errors.push({ member: m.name, error: result.error ?? "unknown" });
      } else {
        result = { ok: false, error: m.linked_user_id ? "self_member_skipped" : "member_not_linked" };
      }
    } else if (m.contact_method === "whatsapp" && m.contact_value) {
      result = await sendWhatsApp(m.contact_value, WA_TEMPLATE, [
        requesterName, body.text.trim(), responseUrl,
      ]);
      if (result.ok) channels.whatsapp++;
    } else if (m.contact_method === "email" && m.contact_value) {
      result = await sendEmail(
        m.contact_value,
        `${requesterName} is asking their ${circle.name} circle`,
        queryEmailHtml({ requesterName, queryText: body.text.trim(), responseUrl, circleName: circle.name }),
      );
      if (result.ok) channels.email++;
    } else if (m.contact_method === "linkedin") {
      result = { ok: true };
      channels.linkedin++;
    }

    // Dual doorway: linked members on non-app channels ALSO get the in-app
    // notification with the Answer button (same response token → one row).
    if (linkedOther && m.contact_method !== "app") {
      const d = await appDoorway(m, token);
      if (d.ok) app_doorways++;
      else app_doorway_errors.push({ member: m.name, error: d.error ?? "unknown" });
    }

    await admin.from("query_responses").update({
      send_status: result.ok ? "sent" : "failed",
      send_error: result.ok ? null : result.error,
    }).eq("response_token", token);

    deliveries.push({
      member_id: m.id, member: m.name, channel: channelUsed,
      status: result.ok ? "sent" : "failed", error: result.ok ? null : (result.error ?? "unknown"),
    });
    if (!result.ok) failures.push({ member: m.name, error: result.error ?? "unknown" });
  }

  return json({
    engine: ENGINE,
    query_id: queryId,
    sent: reachable.length - failures.length,
    channels,
    failures,
    deliveries,
    app_doorways,
    app_doorway_errors,
    wa_template: WA_TEMPLATE,
  });
});
