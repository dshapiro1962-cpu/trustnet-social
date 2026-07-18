// ============================================================================
// /functions/v1/send-collection           engine: send-collection-v1
// Auth: caller JWT. POST { token, circle_id, share_url }
// Fans a collection link out to a circle: in-app notification for linked
// members, email for email members. WhatsApp members are returned as
// status "manual" — the app gives the sender a one-tap wa.me link
// (a personal message from the sender needs no Meta template).
// ============================================================================
import { adminClient, userClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";
import { sendEmail } from "../_shared/channels.ts";

const ENGINE = "send-collection-v3";

interface Body { token: string; circle_id: string; share_url: string; }

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const token = (body.token || "").trim();
  const shareUrl = (body.share_url || "").trim();
  if (!token || !body.circle_id) return err("token and circle_id required");
  if (!/^https:\/\//.test(shareUrl)) return err("share_url must be https");

  const supa = userClient(req);
  const admin = adminClient();

  const { data: col, error: cErr } = await supa
    .from("collections").select("*").eq("token", token).single();
  if (cErr || !col) return err("collection_not_found", 404);
  if (col.owner_id !== userId) return err("not_collection_owner", 403);

  const { data: circle, error: circErr } = await supa
    .from("circles").select("*").eq("id", body.circle_id).single();
  if (circErr || !circle) return err("circle_not_found", 404);

  const { data: members, error: mErr } = await supa
    .from("members").select("*").eq("circle_id", body.circle_id);
  if (mErr) return err("members_load_failed", 500);

  const { data: me } = await supa.from("users").select("name").eq("id", userId).single();
  const senderName = me?.name ?? "Someone";

  const { count: itemCount } = await admin
    .from("collection_items").select("id", { count: "exact", head: true })
    .eq("collection_id", col.id);
  const nItems = itemCount ?? 0;

  const deliveries: { member_id: string; member: string; channel: string; status: string; error: string | null; app_doorway: boolean }[] = [];

  for (const m of (members ?? []).filter((x: any) => !x.is_external_source)) {
    const linkedOther = !!m.linked_user_id && m.linked_user_id !== userId;
    let status = "failed"; let errMsg: string | null = "unsupported_channel"; let channel = m.contact_method ?? "unknown";
    let appDoorway = false;

    // Dual doorway (v3): linked members ALWAYS get the in-app notification,
    // in ADDITION to their contact channel below — same principle as send-query.
    if (linkedOther) {
      const { error: nErr } = await admin.from("notifications").insert({
        user_id: m.linked_user_id, type: "collection_shared",
        title: senderName + " shared a list with you: \u201C" + col.title + "\u201D",
        body: nItems + " recommendation" + (nItems !== 1 ? "s" : "") + " \u2014 tap to view and save them to your library.",
        actor_name: senderName, circle_id: circle.id, link_url: shareUrl,
      });
      appDoorway = !nErr;
      if (nErr) console.error("collection_app_doorway_failed", m.name, nErr.message);
    }

    if (m.contact_method === "app") {
      channel = "app";
      status = appDoorway ? "sent" : (linkedOther ? "failed" : "failed");
      errMsg = appDoorway ? null : (linkedOther ? "notification_insert_failed" : "member_not_linked");
    } else if (m.contact_method === "email" && m.contact_value) {
      const html = "<div style=\"font-family:Arial,sans-serif;max-width:520px;\">"
        + "<h2 style=\"color:#0D2B1F;\">" + senderName + " shared a list with you</h2>"
        + "<p style=\"font-size:15px;color:#1C2420;\"><b>\u201C" + col.title + "\u201D</b> \u2014 "
        + nItems + " recommendation" + (nItems !== 1 ? "s" : "") + " they trust.</p>"
        + "<p><a href=\"" + shareUrl + "\" style=\"display:inline-block;background:#217A4B;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold;\">View the list</a></p>"
        + "<p style=\"font-size:12px;color:#7A9086;\">Sent via Trustnet \u2014 recommendations from people you actually trust.</p></div>";
      const r = await sendEmail(m.contact_value, senderName + " shared \u201C" + col.title + "\u201D with you", html);
      status = r.ok ? "sent" : "failed"; errMsg = r.ok ? null : (r.error ?? "unknown");
    } else if (m.contact_method === "whatsapp" && m.contact_value) {
      channel = "whatsapp";
      status = "manual"; errMsg = null; // app renders a wa.me one-tap link for the sender
    }

    deliveries.push({ member_id: m.id, member: m.name, channel, status, error: errMsg, app_doorway: appDoorway && m.contact_method !== "app" });
  }

  return json({ engine: ENGINE, ok: true, title: col.title, deliveries });
});
