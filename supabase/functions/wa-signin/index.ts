// ============================================================================
// POST /functions/v1/wa-signin                      engine: wa-signin-v1
//
// WhatsApp as a real identity path. Most Trustnet users will arrive through
// WhatsApp, so "sign in with your number" has to be first-class rather than an
// email-only door with a phone bolted on afterwards.
//
//   { action: "start",  phone }         -> sends a 6-digit code over WhatsApp
//   { action: "verify", phone, code }   -> { access_token, refresh_token, is_new }
//
// Security shape:
//   · codes are stored HASHED, never in clear
//   · 10-minute expiry, 5 attempts, rate-limited per number
//   · a wrong number simply gets no message; we never reveal who is registered
//   · the session is minted by Supabase auth, not by us
//
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
import { json, err, handleOptions } from "../_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// A dedicated admin client with session persistence OFF. The shared
// adminClient() is fine elsewhere, but this function MINTS sessions — a client
// that remembers auth state between invocations in a warm instance could leak
// one caller's session into another's request.
function signinAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const ENGINE = "wa-signin-v1";
const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;
const MAX_PER_HOUR = 5;

// One canonical form, matching phone_key() in the database exactly.
function phoneKey(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length >= 9 ? d.slice(-9) : d;
}

// E.164 for WhatsApp delivery: Israeli local -> +972…
function toE164(raw: string): string {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return d.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) { console.error("wa_signin_missing_secrets"); return false; }
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to,
        type: "text", text: { body: text },
      }),
    });
    if (!r.ok) {
      // Verbatim, per the observability doctrine — a silent send failure here
      // would look exactly like "the code never arrived".
      console.error("wa_signin_send_failed", r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("wa_signin_send_exception", String(e).slice(0, 200));
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid_json"); }

  const action = String(body.action || "");
  const rawPhone = String(body.phone || "").trim();
  const key = phoneKey(rawPhone);
  if (!key || key.length < 9) return err("invalid_phone");

  const admin = signinAdmin();

  // ── START: send a code ─────────────────────────────────────────────────────
  if (action === "start") {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("wa_otp").select("id, created_at")
      .eq("phone_key", key).gte("created_at", since)
      .order("created_at", { ascending: false });

    if ((recent || []).length >= MAX_PER_HOUR) return err("too_many_requests", 429);
    if ((recent || []).length) {
      const last = new Date((recent as { created_at: string }[])[0].created_at).getTime();
      const wait = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (Date.now() - last)) / 1000);
      if (wait > 0) return json({ engine: ENGINE, sent: false, retry_in: wait });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256(key + ":" + code);
    const { error: insErr } = await admin.from("wa_otp").insert({
      phone_key: key, phone: rawPhone, code_hash: codeHash,
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
    });
    if (insErr) { console.error("wa_otp_insert_failed", insErr.message); return err("otp_store_failed", 500); }

    const ok = await sendWhatsAppText(toE164(rawPhone),
      `Your Trustnet code is ${code}\n\nIt expires in ${CODE_TTL_MIN} minutes. If you didn't ask to sign in, ignore this message.`);
    // Deliberately identical response either way: never reveal who is reachable.
    return json({ engine: ENGINE, sent: true, delivered: ok });
  }

  // ── VERIFY: check the code, then mint a real session ───────────────────────
  if (action === "verify") {
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) return err("invalid_code");

    const { data: rows } = await admin
      .from("wa_otp").select("*")
      .eq("phone_key", key).is("consumed_at", null)
      .order("created_at", { ascending: false }).limit(1);
    const otp = (rows || [])[0] as Record<string, unknown> | undefined;
    if (!otp) return err("no_pending_code");
    if (new Date(String(otp.expires_at)).getTime() < Date.now()) return err("code_expired");
    if (Number(otp.attempts) >= MAX_ATTEMPTS) return err("too_many_attempts", 429);

    const expected = await sha256(key + ":" + code);
    if (expected !== String(otp.code_hash)) {
      await admin.from("wa_otp").update({ attempts: Number(otp.attempts) + 1 }).eq("id", otp.id as string);
      return err("wrong_code");
    }
    await admin.from("wa_otp").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id as string);

    // The account: find by phone, else create one keyed to this number.
    const { data: existing } = await admin
      .from("users").select("id, name").eq("phone_key", key).maybeSingle();

    let userId: string;
    let isNew = false;
    const syntheticEmail = "wa" + key + "@wa.trustnet.local";

    if (existing) {
      userId = String(existing.id);
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: syntheticEmail,
        phone: "+" + toE164(rawPhone),
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { signup_channel: "whatsapp", phone: rawPhone },
      });
      if (cErr || !created?.user) {
        console.error("wa_signin_create_user_failed", cErr?.message);
        return err("account_create_failed: " + (cErr?.message || "unknown"), 500);
      }
      userId = created.user.id;
      isNew = true;
      const { error: pErr } = await admin.from("users").insert({
        id: userId, name: "", email: syntheticEmail, phone: rawPhone,
        avatar: "", avatar_color: "#217A4B", joined_date: new Date().toISOString().slice(0, 10),
      });
      if (pErr) console.error("wa_signin_profile_insert_failed", pErr.message);
    }

    // Make sure the phone is recorded even for accounts that predate this path.
    await admin.from("users").update({ phone: rawPhone }).eq("id", userId).is("phone", null);

    // Any circle member holding this number is this person — link them now.
    await admin.from("members")
      .update({ linked_user_id: userId })
      .eq("contact_method", "whatsapp").eq("contact_key", key).is("linked_user_id", null);

    // Mint a session through Supabase auth itself.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink", email: syntheticEmail,
    });
    if (linkErr || !linkData) {
      console.error("wa_signin_link_failed", linkErr?.message);
      return err("session_failed: " + (linkErr?.message || "unknown"), 500);
    }
    const props = linkData.properties as Record<string, string> | undefined;
    const hashed = props?.hashed_token;
    if (!hashed) return err("session_failed_no_token", 500);

    const { data: verified, error: vErr } = await admin.auth.verifyOtp({
      type: "magiclink", token_hash: hashed,
    });
    if (vErr || !verified?.session) {
      console.error("wa_signin_verify_failed", vErr?.message);
      return err("session_failed: " + (vErr?.message || "unknown"), 500);
    }

    return json({
      engine: ENGINE,
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      is_new: isNew,
      user_id: userId,
    });
  }

  return err("unknown_action");
});
