// ============================================================================
// POST /functions/v1/connector-confirm         engine: connector-confirm-v1
//
// THE HUMAN PRESS. A connector can draft a question (see functions/mcp) and it
// cannot send one. This is what sends, and it only does so when a person has
// opened the link, read who would receive what, and pressed the button.
//
// Public — no JWT. The confirm token IS the credential, exactly as the
// single-use response_token is for receive-response. It authorises ONE
// pre-described action against ONE draft: the holder can edit the wording and
// nothing else. Not who it goes to, not which circle, not whose account.
// Single use, thirty minutes, enforced in SQL by `confirmed_at is null` inside
// the UPDATE (0053 §8) so two taps send one message.
//
//   { action: "view",    token }  -> what the page shows
//   { action: "send",    token, text? }  -> sends, once
//   { action: "discard", token }  -> and it stays discarded
//
// Deploy with --no-verify-jwt: the caller is a signed-out page.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "connector-confirm-v2";

// WHO IS PRESSING. Until v2 the confirm token was the whole credential, and
// draft_question hands that token to the connector — so anything holding a
// connector token could draft a question and then follow its own link and send
// it. The human press was an affordance, not a boundary.
//
// Now the send and the discard require a real member session, and 0054 checks
// inside the UPDATE that the session belongs to the draft's owner. The member
// is already signed in on their own phone, so nothing changes for a person;
// what changes is that the link is worth nothing on its own, which is what
// makes it safe to hand to an assistant.
//
// The ANON KEY IS NOT A SESSION. It is a valid JWT and getUser() refuses it,
// which is the behaviour relied on here — the page sends the anon key for
// `view` and a real access token for `send`.
async function callerId(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: "Bearer " + jwt } } },
    );
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch (_e) {
    return null;
  }
}

// Minting a session for the owner, to call send-query AS THEM. send-query then
// runs exactly as it does for the app — same delivery, same per-member results,
// same notifications. There is no second way to send a question in this
// product, and this does not become one.
async function ownerSession(ownerId: string): Promise<string | null> {
  const admin = adminClient();
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(ownerId);
  if (uErr || !u?.user?.email) return null;
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink", email: u.user.email,
  });
  const hashed = (link?.properties as Record<string, string> | undefined)?.hashed_token;
  if (lErr || !hashed) return null;
  const { data: verified, error: vErr } = await admin.auth.verifyOtp({
    type: "magiclink", token_hash: hashed,
  });
  if (vErr || !verified?.session) return null;
  return verified.session.access_token;
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: { action?: string; token?: string; text?: string };
  try { body = await req.json(); } catch { return err("bad_body"); }

  const action = String(body.action ?? "view");
  const token = String(body.token ?? "").trim();
  if (!token) return err("token_required");

  const admin = adminClient();

  // ── view ────────────────────────────────────────────────────────────────
  // NAMES, NOT NUMBERS. connector_draft_view returns the recipients' names so
  // the member can judge the send, and deliberately no contact details — the
  // privacy policy and the connector's access requirements both promise in
  // writing that a connector cannot read a circle's phone numbers, and this is
  // the only surface where that promise could have leaked.
  if (action === "view") {
    const { data, error } = await admin.rpc("connector_draft_view", { p_confirm_token: token });
    if (error) {
      console.error("draft_view_failed", error.message);
      return err("view_failed", 500);
    }
    return json({ engine: ENGINE, ...(data as Record<string, unknown>) });
  }

  // ── discard ─────────────────────────────────────────────────────────────
  if (action === "discard") {
    const who = await callerId(req);
    if (!who) return json({ engine: ENGINE, discarded: false, reason: "sign_in_required" }, 401);
    const { data, error } = await admin.rpc("connector_draft_discard", {
      p_confirm_token: token, p_user_id: who,
    });
    if (error) {
      console.error("draft_discard_failed", error.message);
      return err("discard_failed", 500);
    }
    return json({ engine: ENGINE, discarded: data === true });
  }

  // ── send ────────────────────────────────────────────────────────────────
  if (action !== "send") return err("unknown_action");

  // THE PRESS MUST BE THE MEMBER. Refused before anything is claimed, so a
  // caller without a session cannot even burn the draft's single use.
  const presser = await callerId(req);
  if (!presser) {
    return json({ engine: ENGINE, sent: false, reason: "sign_in_required" }, 401);
  }

  // CLAIM FIRST, SEND SECOND. The claim is the single-use gate: if it comes
  // back false the draft was already sent, already discarded, or expired, and
  // nothing is delivered. Asserting on the ROW OUTCOME rather than on the
  // absence of an error is the rule this project learned the hard way.
  const { data: claim, error: cErr } = await admin.rpc("connector_draft_claim", {
    p_confirm_token: token,
    p_text: body.text ? String(body.text) : null,
    p_user_id: presser,
  });
  if (cErr) {
    console.error("draft_claim_failed", cErr.message);
    return err("claim_failed", 500);
  }
  const c = (claim ?? {}) as Record<string, unknown>;
  if (c.claimed !== true) return json({ engine: ENGINE, sent: false, reason: "already_handled" });

  const accessToken = await ownerSession(String(c.owner_id));
  if (!accessToken) {
    console.error("confirm_session_failed", String(c.owner_id));
    return err("session_failed", 500);
  }

  const res = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/send-query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: JSON.stringify({
      circle_id: c.circle_id,
      text: c.text,
      ...(Array.isArray(c.member_ids) && c.member_ids.length ? { member_ids: c.member_ids } : {}),
    }),
  });

  const text = await res.text();
  let sent: Record<string, unknown>;
  try { sent = JSON.parse(text); } catch { sent = { error: text.slice(0, 300) }; }

  if (!res.ok) {
    // The claim already happened, so the draft cannot be re-sent by a retry.
    // Say so rather than leaving the page implying it went.
    console.error("confirm_send_failed", res.status, text.slice(0, 300));
    return json({ engine: ENGINE, sent: false, reason: "send_failed", detail: sent }, 502);
  }

  // Record which query the draft became, so a draft is traceable to what it
  // actually sent rather than only to what it said it would.
  if (sent && typeof sent.query_id === "string") {
    const { error: uErr } = await admin.from("connector_drafts")
      .update({ query_id: sent.query_id }).eq("confirm_token", token);
    if (uErr) console.error("draft_query_link_failed", uErr.message);
  }

  return json({ engine: ENGINE, sent: true, result: sent });
});
