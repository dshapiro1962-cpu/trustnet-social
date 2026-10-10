// ============================================================================
// POST /functions/v1/redeem-invite                      engine: redeem-invite-v1
//
// A PERSONAL INVITATION BECOMES AN ACCOUNT (0059). dan, 10 Oct 2026: the
// invited person taps the link in WhatsApp, fills in their name and location,
// taps Sign in, and is in - "the user does not have to do anything beyond the
// 3 steps". No WhatsApp message to send: the personal link, sent from the
// inviter's own WhatsApp to that person's number, is the proof.
//
// Body: { token, name, location }
// Returns: { access_token, refresh_token, circle }
// Auth: none - the caller is by definition signed out. The TOKEN is the
// credential: 32 random hex, made for one person, spent on first use.
//
// The account gets NO phone number. The inviter typed it; the person never
// proved it, and 0057 lets only the server write users.phone for exactly this
// reason. A wrong number typed by an inviter must not pull the real owner of
// that number into this account at their first WhatsApp sign-in.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "redeem-invite-v1";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: { token?: string; name?: string; location?: string };
  try { body = await req.json(); } catch { return err("bad_body"); }
  const token = String(body.token ?? "").trim();
  const name = String(body.name ?? "").trim().slice(0, 50);
  const location = String(body.location ?? "").trim().slice(0, 80);
  if (!/^[0-9a-f]{32}$/.test(token)) return err("bad_token");
  if (!name) return err("name_required");

  const admin = adminClient();

  // ── 1. the invitation must be live BEFORE an account is made for it ─────
  const { data: inv, error: invErr } = await admin
    .from("personal_invites").select("token, used_at, expires_at")
    .eq("token", token).maybeSingle();
  if (invErr) return err("invite_lookup_failed: " + invErr.message, 500);
  if (!inv || inv.used_at || new Date(inv.expires_at) <= new Date()) {
    return err("invite_used_or_expired", 410);
  }

  // ── 2. the account ──────────────────────────────────────────────────────
  // An address that is nobody's inbox: it exists only so a session can be
  // minted the same way complete-join mints one.
  const email = `inv-${crypto.randomUUID()}@invite.trustnet.local`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { via: "personal_invite" },
  });
  if (cErr || !created?.user) return err("create_failed: " + (cErr?.message ?? "unknown"), 500);
  const userId = created.user.id;

  // Anything that fails from here takes the account back out with it, so a
  // failed sign-in never leaves an empty account behind.
  const undo = async (reason: string, status: number) => {
    const { error: dErr } = await admin.auth.admin.deleteUser(userId);
    if (dErr) console.error("redeem_cleanup_failed", userId, dErr.message);
    return err(reason, status);
  };

  const { error: pErr } = await admin.from("users").insert({
    id: userId, email, name, location: location || null,
  });
  if (pErr) return await undo("profile_insert_failed: " + pErr.message, 500);

  // ── 3. this account is that person ──────────────────────────────────────
  // One implementation, shared with accept_personal_invite. It locks the
  // invitation row, so two taps at once cannot both get through.
  const { data: red, error: rErr } = await admin.rpc("redeem_personal_invite", {
    p_token: token, p_user_id: userId,
  });
  if (rErr) return await undo("redeem_failed: " + rErr.message, 500);
  if (!red?.ok) return await undo("invite_" + String(red?.reason ?? "refused"), 410);

  // ── 4. the session, minted as complete-join mints it ────────────────────
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink", email,
  });
  if (lErr || !linkData) return err("session_failed: " + (lErr?.message ?? "unknown"), 500);
  const hashed = (linkData.properties as Record<string, string> | undefined)?.hashed_token;
  if (!hashed) return err("session_failed_no_token", 500);
  const { data: verified, error: vErr } = await admin.auth.verifyOtp({
    type: "magiclink", token_hash: hashed,
  });
  if (vErr || !verified?.session) return err("session_failed: " + (vErr?.message ?? "unknown"), 500);

  return json({
    engine: ENGINE,
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    circle: red.circle ?? null,
  });
});
