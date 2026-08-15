// ============================================================================
// POST /functions/v1/complete-join                      engine: complete-join-v1
//
// The privileged half of the codeless WhatsApp join.
//
// THE FLOW: naama taps ONE button, WhatsApp opens with "Join Trustnet: <token>"
// already written, she presses send. Her message reaches the Trustnet number
// FROM HER PHONE NUMBER — WhatsApp guarantees that — so the act of sending IS
// the verification. No code, no digits, nothing typed.
//
// WHY THE WEBHOOK CANNOT DO THIS: it does not verify Meta's signature, so a
// forged request could claim to come from any number. If the webhook created
// accounts and memberships, one forged call would let anyone become anyone.
// Instead the webhook only RECORDS a claim; this function — reached from the
// BROWSER TAB THAT HOLDS THE TOKEN — turns a claim into an account.
// A forged claim with no corresponding browser session achieves nothing.
//
// Body: { token, phone }   phone must match the recorded claim exactly.
// Returns: { access_token, refresh_token, is_new, circle }
// Auth: none — the caller is by definition signed out. The TOKEN is the
// credential, and it is 32 random characters held only by whoever tapped the
// invite.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "complete-join-v1";

function phoneKey(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}
function toE164(raw: string): string {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return d.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: { token?: string; phone?: string };
  try { body = await req.json(); } catch { return err("bad_body"); }
  const token = String(body.token ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!token || !phone) return err("token_and_phone_required");

  const admin = adminClient();

  // ── 1. the claim must be real, unexpired, unconsumed, and for THIS phone ──
  // Checked server-side against what the WEBHOOK recorded. A caller cannot
  // invent a phone: it must match the number that actually sent the message.
  const { data: claim, error: claimErr } = await admin
    .from("invite_claims")
    .select("id, token, claimed_phone, consumed_at, expires_at")
    .eq("token", token).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("claimed_at", { ascending: false })
    .limit(1).maybeSingle();
  if (claimErr) return err("claim_lookup_failed: " + claimErr.message, 500);
  if (!claim) return err("no_live_claim", 404);
  if (phoneKey(claim.claimed_phone) !== phoneKey(phone)) {
    return err("phone_mismatch", 403);
  }

  // ── 2. the invite must still be valid ────────────────────────────────────
  const { data: link, error: linkErr } = await admin
    .from("circle_invite_links").select("token, circle_id, owner_id, active")
    .eq("token", token).eq("active", true).maybeSingle();
  if (linkErr) return err("link_lookup_failed: " + linkErr.message, 500);
  if (!link) return err("invite_no_longer_valid", 410);

  const { data: circle } = await admin
    .from("circles").select("id, name, owner_id").eq("id", link.circle_id).maybeSingle();
  if (!circle) return err("circle_gone", 410);

  // ── 3. find or create the account for this phone ─────────────────────────
  // THE INVITER USUALLY ALREADY HAS A NAME FOR THEM. naama appeared in dan's
  // leros circle as "+972545543467" because this function named her from her
  // own phone number — while the member row dany created for her carried her
  // real name all along. WhatsApp does not expose a name, so the only name
  // available is the one the person who invited her already wrote down.
  const key = phoneKey(phone);
  const e164 = toE164(phone);
  const { data: knownAs } = await admin
    .from("members").select("name")
    .eq("owner_id", link.owner_id)
    .eq("contact_value", "+" + e164)
    .not("name", "is", null)
    .limit(1).maybeSingle();
  // Reject a "name" that is just the number again, or we would adopt the same
  // placeholder we are trying to avoid.
  const invitedName = (knownAs?.name && !/^\+?\d[\d\s\-()]*$/.test(knownAs.name))
    ? knownAs.name : null;

  const { data: candidates, error: usersErr } = await admin
    .from("users").select("id, name, phone").not("phone", "is", null);
  if (usersErr) return err("users_lookup_failed: " + usersErr.message, 500);
  let userId = (candidates ?? []).find((u) => phoneKey(u.phone) === key)?.id ?? null;
  let isNew = false;

  const syntheticEmail = `wa${key}@wa.trustnet.local`;
  if (!userId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: syntheticEmail, email_confirm: true,
      user_metadata: { phone: "+" + e164, via: "invite_join" },
    });
    if (cErr || !created?.user) return err("create_failed: " + (cErr?.message ?? "unknown"), 500);
    userId = created.user.id;
    isNew = true;
    // The profile row. Named from the phone until they set a real name — an
    // empty name would render as a blank member in someone's circle.
    const { error: pErr } = await admin.from("users").insert({
      // The inviter's name for them, falling back to the number only when
      // there genuinely is no name to use.
      id: userId, email: syntheticEmail, name: invitedName ?? ("+" + e164),
      phone: "+" + e164,
    });
    if (pErr) console.error("profile_insert_failed", pErr.message);
  }

  // ── 4. join the circle ───────────────────────────────────────────────────
  // Idempotent: pressing send twice must not create two memberships.
  const { data: existingMember } = await admin
    .from("members").select("id")
    .eq("circle_id", circle.id).eq("linked_user_id", userId).maybeSingle();

  if (!existingMember) {
    const { data: me } = await admin
      .from("users").select("name, avatar, avatar_color, email").eq("id", userId).maybeSingle();
    const { error: mErr } = await admin.from("members").insert({
      owner_id: circle.owner_id, circle_id: circle.id,
      name: invitedName ?? me?.name ?? ("+" + e164),
      avatar: me?.avatar ?? null, avatar_color: me?.avatar_color ?? null,
      trust_basis: "Joined via invite link",
      // A CONTACT IS NOT OPTIONAL. Every send feature dispatches on
      // contact_method, and a member without one is unreachable — the
      // "unsupported_channel" failure that cost a full day.
      contact_method: "whatsapp", contact_value: "+" + e164,
      response_rate: "unknown", linked_user_id: userId,
    });
    if (mErr) return err("join_failed: " + mErr.message, 500);

    // `uses` incremented in two steps. NOTE the earlier one-liner had
    //   (…).data?.uses ?? 0 + 1
    // which binds as `?? (0 + 1)` — an existing count of 5 stayed 5, and only a
    // null became 1. Lint and type-check both passed it. Operator precedence is
    // invisible to every check except reading it.
    const { data: linkRow } = await admin.from("circle_invite_links")
      .select("uses").eq("token", token).maybeSingle();
    await admin.from("circle_invite_links")
      .update({ uses: (linkRow?.uses ?? 0) + 1 })
      .eq("token", token);

    await admin.from("notifications").insert({
      user_id: circle.owner_id, type: "invite_accepted",
      title: (me?.name ?? ("+" + e164)) + " joined your " + circle.name + " circle",
      body: "They joined via your invite link and can now receive your queries.",
      circle_id: circle.id, actor_name: me?.name ?? null,
    });
  }

  // ── 5. consume the claim, so a forward cannot reuse it ───────────────────
  await admin.from("invite_claims")
    .update({ consumed_at: new Date().toISOString() }).eq("id", claim.id);

  // ── 6. mint a session — same mechanism wa-signin already uses ────────────
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink", email: syntheticEmail,
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
    is_new: isNew,
    circle: circle.name,
  });
});
