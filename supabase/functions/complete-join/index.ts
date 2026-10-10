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
// WHY THE WEBHOOK DOES NOT DO THIS: it did not verify Meta's signature until
// 7 Oct 2026 (it does now), so a
// forged request could claim to come from any number. If the webhook created
// accounts and memberships, one forged call would let anyone become anyone.
// Instead the webhook only RECORDS a claim; this function — reached from the
// BROWSER TAB THAT HOLDS THE TOKEN — turns a claim into an account.
// A forged claim with no corresponding browser session achieves nothing.
//
// TWO KINDS OF TOKEN (0052). The same proof - a message that can only have
// come from that number - now also signs people in with no circle involved.
// The 6-digit code it replaces had never once worked: nine codes requested
// since 10 August, none ever used, because wa-signin sent a free-form message
// and WhatsApp refuses those outside a 24-hour window. dan: "no digit path
// discard it", and sign-in and sign-up are one act.
//
// TWO DOORS ONTO ONE CLAIM (0056). The waiting page finishes with { token,
// phone }; the link in Trustnet's WhatsApp reply finishes with { finish }, a
// pass of its own minted with the claim. They used to be one single-use door:
// the page got there first, the link opened in another browser, found the
// claim spent and dropped the person on Sign in - phone ...4488, 6 Oct, signed
// in twice in three minutes. Each door now works once, and neither can use up
// the other.
//
// Body: { token, phone }   phone must match the recorded claim exactly.
//    or { finish }         the reply's pass; the claim supplies token and phone.
// Returns: { access_token, refresh_token, is_new, circle }   circle is null
//          when the token was a sign-in rather than an invitation.
// Auth: none — the caller is by definition signed out. The TOKEN is the
// credential, and it is 32 random characters held only by whoever tapped the
// invite.
// ============================================================================
import { adminClient, json, err, handleOptions, phoneKey, toE164 } from "../_shared/utils.ts";

const ENGINE = "complete-join-v1";


Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: { token?: string; phone?: string; finish?: string };
  try { body = await req.json(); } catch { return err("bad_body"); }
  const finish = String(body.finish ?? "").trim();
  let token = String(body.token ?? "").trim();
  let phone = String(body.phone ?? "").trim();
  if (!finish && (!token || !phone)) return err("token_and_phone_required");

  const admin = adminClient();

  // ── 1. the claim must be real, unexpired, unconsumed, and for THIS phone ──
  // Checked server-side against what the WEBHOOK recorded. A caller cannot
  // invent a phone: it must match the number that actually sent the message.
  let claim: { id: string; token: string; claimed_phone: string; claimed_name: string | null } | null;
  if (finish) {
    // THE REPLY'S DOOR (0056). Spent in the same statement that finds it, so
    // two browsers opening one link cannot both get through. It never touches
    // consumed_at - that is the waiting page's half - so the page can still
    // finish too, and no claim lives a second longer than it did before.
    const { data: byFinish, error: finErr } = await admin
      .from("invite_claims")
      .update({ finish_used_at: new Date().toISOString() })
      .eq("finish_secret", finish).is("finish_used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id, token, claimed_phone, claimed_name")
      .maybeSingle();
    if (finErr) return err("finish_lookup_failed: " + finErr.message, 500);
    if (!byFinish) return err("finish_used_or_expired", 410);
    claim = byFinish;
    token = byFinish.token;
    phone = byFinish.claimed_phone;
  } else {
    const { data: byToken, error: claimErr } = await admin
      .from("invite_claims")
      .select("id, token, claimed_phone, claimed_name, consumed_at, expires_at")
      .eq("token", token).is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("claimed_at", { ascending: false })
      .limit(1).maybeSingle();
    if (claimErr) return err("claim_lookup_failed: " + claimErr.message, 500);
    if (!byToken) return err("no_live_claim", 404);
    claim = byToken;
    if (phoneKey(claim.claimed_phone) !== phoneKey(phone)) {
      return err("phone_mismatch", 403);
    }
  }

  // ── 2. the invite must still be valid ────────────────────────────────────
  const { data: link, error: linkErr } = await admin
    .from("circle_invite_links").select("token, circle_id, owner_id, active")
    .eq("token", token).eq("active", true).maybeSingle();
  if (linkErr) return err("link_lookup_failed: " + linkErr.message, 500);

  // NO CIRCLE BEHIND IT? Then it is a sign-in token, or it is nothing. Asked
  // of the database rather than assumed: only a live, unspent one counts.
  let isSignin = false;
  if (!link && finish) {
    // Through the reply's door the waiting page may already have spent the
    // sign-in token - that is the very case this door exists for. The claim's
    // ten minutes, checked above, are the limit; the token need only be one.
    const { data: st, error: stErr } = await admin
      .from("signin_tokens").select("token").eq("token", token).maybeSingle();
    if (stErr) return err("signin_token_lookup_failed: " + stErr.message, 500);
    if (!st) return err("invite_no_longer_valid", 410);
    isSignin = true;
  } else if (!link) {
    const { data: live, error: liveErr } = await admin
      .rpc("is_live_signin_token", { p_token: token });
    if (liveErr) return err("signin_token_lookup_failed: " + liveErr.message, 500);
    if (!live) return err("invite_no_longer_valid", 410);
    isSignin = true;
  }

  const { data: circle } = link
    ? await admin.from("circles").select("id, name, owner_id").eq("id", link.circle_id).maybeSingle()
    : { data: null };
  if (link && !circle) return err("circle_gone", 410);

  // ── 3. find or create the account for this phone ─────────────────────────
  // THE INVITER USUALLY ALREADY HAS A NAME FOR THEM. naama appeared in dan's
  // leros circle as "+972545543467" because this function named her from her
  // own phone number — while the member row dany created for her carried her
  // real name all along. WhatsApp does not expose a name, so the only name
  // available is the one the person who invited her already wrote down.
  const key = phoneKey(phone);
  const e164 = toE164(phone);
  // toE164 returns "" for a national-format number rather than guessing its
  // country. That cannot happen here - the number comes from WhatsApp, which
  // reports it international - but if it ever did, "+" + "" would look up the
  // contact_value "+" and quietly match nothing. Skip the lookup instead, so
  // the fallback to the WhatsApp profile name is a decision and not an
  // accident.
  const { data: knownAs } = (link && e164)
    ? await admin
        .from("members").select("name")
        .eq("owner_id", link.owner_id)
        .eq("contact_value", "+" + e164)
        .not("name", "is", null)
        .limit(1).maybeSingle()
    : { data: null };
  // Reject a "name" that is just the number again, or we would adopt the same
  // placeholder we are trying to avoid.
  const invitedName = (knownAs?.name && !/^\+?\d[\d\s\-()]*$/.test(knownAs.name))
    ? knownAs.name : null;

  // AND FAILING THAT, THE NAME THEY GAVE WHATSAPP (0050).
  //
  // The comment above says WhatsApp does not expose a name. That is true of a
  // phone number on its own and wrong about the webhook payload, which carries
  // value.contacts[0].profile.name on every inbound message. record_invite_claim
  // now stores it on the claim, already trimmed, length-capped, and with a
  // bare number rejected - so anything arriving here is a usable name.
  //
  // ORDER MATTERS AND IS DELIBERATE. The inviter's own label wins, because
  // dan's rule is that each owner keeps their own name for someone. Their
  // WhatsApp profile name comes next. The number is what is left when nobody
  // anywhere knows what to call them.
  const profileName: string | null = (claim as any)?.claimed_name ?? null;

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
      id: userId, email: syntheticEmail,
      name: invitedName ?? profileName ?? ("+" + e164),
      phone: "+" + e164,
    });
    if (pErr) console.error("profile_insert_failed", pErr.message);
  }

  // ── 4. join the circle ───────────────────────────────────────────────────
  //
  // ONE DOOR (0051). This looked for a member carrying the joiner's USER id
  // and inserted one when it found none. A row the inviter typed BEFORE that
  // person had an account can never carry it — so every invite to someone
  // already in the circle tried to insert, and members_person_circle_uniq
  // refused it. Measured in production, 21 Sep: naama's account was created at
  // 15:33:14, her membership never was, the claim was never consumed, and she
  // read "Couldn't finish signing you in" for ever. Eleven joins had ever
  // worked, all of them people joining a circle they were not already in.
  //
  // join_circle_as_user resolves the PERSON through contact_key — the same
  // normaliser the unique index is built on — and links the row that is
  // already there. Idempotent, so pressing send twice is still one membership.
  // A SIGN-IN JOINS NOTHING. Everything below this point that is about a
  // circle is skipped, and the session is minted exactly the same way.
  const { data: joined, error: joinErr } = circle
    ? await admin.rpc("join_circle_as_user", {
        p_circle_id: circle.id,
        p_user_id: userId,
        p_name: invitedName ?? profileName ?? null,
      })
    : { data: { ok: true, outcome: "signin" }, error: null };
  if (joinErr) return err("join_failed: " + joinErr.message, 500);
  const res = (joined ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    // Signing in still worked; being the owner of the circle you tapped is not
    // a failure to sign in, so only a real refusal stops here.
    if (res.reason !== "own_circle") {
      return err("join_failed: " + String(res.reason ?? "unknown"), 500);
    }
  }
  const outcome = String(res.outcome ?? "");

  if (circle && (outcome === "adopted" || outcome === "created")) {
    // `uses` incremented in two steps. NOTE the earlier one-liner had
    //   (…).data?.uses ?? 0 + 1
    // which binds as `?? (0 + 1)` — an existing count of 5 stayed 5, and only a
    // null became 1. Lint and type-check both passed it. Operator precedence is
    // invisible to every check except reading it.
    const { data: linkRow } = await admin.from("circle_invite_links")
      .select("uses").eq("token", token).maybeSingle();
    const { error: useErr } = await admin.from("circle_invite_links")
      .update({ uses: (linkRow?.uses ?? 0) + 1 })
      .eq("token", token);
    if (useErr) console.error("invite_uses_increment_failed", token, useErr.message);

    const who = String(res.member_name ?? ("+" + e164));
    const { error: joinNotifErr } = await admin.from("notifications").insert({
      user_id: circle.owner_id, type: "invite_accepted",
      title: who + " joined your " + circle.name + " circle",
      body: "They joined via your invite link and can now receive your queries.",
      circle_id: circle.id, actor_name: who,
    });
    if (joinNotifErr) console.error("join_notify_failed", circle.id, joinNotifErr.message);
  }

  // ── 5. consume the claim, so a forward cannot reuse it ───────────────────
  // SECURITY-RELEVANT, and unchecked until v0.73.0. This is the only thing
  // stopping a forwarded invite from being claimed twice; a silent failure
  // defeats the stated purpose of the step. The join above has already
  // succeeded and must not be rolled back, so this is loud rather than fatal.
  // Only the waiting page's door spends these. The reply's door spent its own
  // pass in step 1, and spending the page's half here would show the page
  // "Couldn't finish signing you in" while the person is already in.
  if (!finish) {
    const { error: claimErr2 } = await admin.from("invite_claims")
      .update({ consumed_at: new Date().toISOString() }).eq("id", claim.id);
    if (claimErr2) {
      console.error("invite_claim_not_consumed", claim.id, claimErr2.message);
    }
    // And the sign-in token itself, for the same reason: one message, one
    // session. Loud rather than fatal - the session below is already earned.
    if (isSignin) {
      const { error: stErr } = await admin.rpc("consume_signin_token", { p_token: token });
      if (stErr) console.error("signin_token_not_consumed", stErr.message);
    }
  }

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
    circle: circle ? circle.name : null,
  });
});
