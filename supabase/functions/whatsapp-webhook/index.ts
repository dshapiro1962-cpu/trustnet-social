// ============================================================================
// /functions/v1/whatsapp-webhook          (deploy with --no-verify-jwt)
// Forward-to-library: message Trustnet's WhatsApp number with text or a link,
// and it becomes a classified, embedded library item — replied with ✓.
// GET  = Meta's verification handshake (hub.challenge echo)
// POST = incoming message events
// Secrets used: WHATSAPP_VERIFY_TOKEN (you invent it), WHATSAPP_TOKEN,
//               WHATSAPP_PHONE_ID, OPENAI_API_KEY, OPENAI_MODEL?,
//               GOOGLE_PLACES_API_KEY?
// ============================================================================
import { adminClient, json } from "../_shared/utils.ts";

const ENGINE = "wawh-v3-image";

const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];

function digits(s: string): string { return (s || "").replace(/\D/g, ""); }

async function sendText(to: string, text: string): Promise<void> {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) return;
  try {
    await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to,
        type: "text", text: { body: text.slice(0, 900) },
      }),
    });
  } catch (_) { /* replies are best-effort */ }
}

function pick(re: RegExp, s: string): string {
  const m = s.match(re);
  return m ? m[1].trim() : "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Meta's verification handshake ──────────────────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ ok: true });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ ok: true }); }

  // Always 200 quickly — Meta retries aggressively otherwise.
  const value = (payload as any)?.entry?.[0]?.changes?.[0]?.value;

  // Delivery-status callbacks: log the verdict Meta gives us for each send
  const st = value?.statuses?.[0];
  if (st) {
    console.log("wa_status", ENGINE, JSON.stringify({
      status: st.status, to: st.recipient_id,
      errors: st.errors ?? null, ts: st.timestamp,
    }));
    return json({ ok: true });
  }

  const msg = value?.messages?.[0];
  if (!msg) return json({ ok: true });

  const from: string = msg.from || "";
  const senderDigits = digits(from);

  // ── who is this? match sender phone to a Trustnet account ─────────────────
  const admin = adminClient();
  const { data: candidates } = await admin
    .from("users").select("id, name, share_by_default, phone")
    .not("phone", "is", null);
  const user = (candidates || []).find((u) => digits(u.phone) === senderDigits);
  if (!user) {
    await sendText(from,
      "Hi! This is Trustnet's save-to-library number, but this phone isn't linked to an account yet. " +
      "Link it in the app and try again.");
    return json({ ok: true });
  }

  if (msg.type !== "text" || !msg.text?.body) {
    await sendText(from, "Send me text or a link and I'll file it in your library 📚");
    return json({ ok: true });
  }

  const raw: string = String(msg.text.body).slice(0, 2000);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    await sendText(from, "Saving is temporarily unavailable (AI not configured).");
    return json({ ok: true });
  }
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  // ── if there's a link, fetch its page for evidence ─────────────────────────
  let pageEvidence = "";
  let imageUrl: string | null = null;
  const urlMatch = raw.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const pres = await fetch(urlMatch[0], {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
      });
      clearTimeout(timer);
      if (pres.ok) {
        const html = (await pres.text()).slice(0, 300_000);
        const t = pick(/<title[^>]*>([^<]{1,300})/i, html);
        const ogT = pick(/property=["']og:title["'][^>]*content=["']([^"']{1,300})/i, html);
        const ogD = pick(/property=["']og:description["'][^>]*content=["']([^"']{1,600})/i, html);
        const bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500);
        const ogImg = pick(/property=["']og:image["'][^>]*content=["']([^"']{1,500})/i, html)
          || pick(/content=["']([^"']{1,500})["'][^>]*property=["']og:image/i, html);
        if (ogImg) { try { imageUrl = new URL(ogImg, urlMatch[0]).href.slice(0, 500); } catch (_) { /* skip bad url */ } }
        pageEvidence = ["page title: " + (ogT || t), ogD ? "page description: " + ogD : "", "page text: " + bodyText]
          .filter(Boolean).join("\n");
      }
    } catch (_) { /* extraction proceeds from the message text alone */ }
  }

  // ── extract the recommendation ─────────────────────────────────────────────
  let out: Record<string, unknown> = {};
  try {
    const chat = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "A user forwarded a WhatsApp message to save a recommendation " +
              "(restaurant, hotel, book, doctor, place, product...). It may be Hebrew or English. " +
              "Identify the SINGLE thing being recommended. Respond JSON only: " +
              '{"name": the thing, "location": city/area or "", ' +
              '"category": one of [' + CATEGORIES.map((c) => '"' + c + '"').join(",") + "], " +
              '"tags": [3-6 short lowercase tags in the content language], ' +
              '"note": <=140 char note capturing why it was recommended, ' +
              '"confident": true|false}',
          },
          { role: "user", content: "message: " + raw + (pageEvidence ? "\n\n" + pageEvidence : "") },
        ],
      }),
    });
    if (!chat.ok) {
      await sendText(from, "Couldn't process that right now — try again in a minute.");
      return json({ ok: true });
    }
    const c = await chat.json();
    out = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
  } catch (_) {
    await sendText(from, "Couldn't process that right now — try again in a minute.");
    return json({ ok: true });
  }

  const name = typeof out.name === "string" ? out.name.slice(0, 80).trim() : "";
  if (!name || out.confident === false) {
    await sendText(from, "I couldn't tell what's being recommended 🤔 Try adding a word, e.g. \"pizza at Tony's, Florentin\".");
    return json({ ok: true });
  }
  const location = typeof out.location === "string" ? out.location.slice(0, 80) : "";
  const category = CATEGORIES.includes(out.category as string) ? out.category as string : "other";
  const tags = Array.isArray(out.tags) ? (out.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 6) : [];
  const note = typeof out.note === "string" ? out.note.slice(0, 140) : "";

  // ── dedup: does this user already have it? ─────────────────────────────────
  const { data: myRecs } = await admin
    .from("recommendations").select("id, canonical_id, canonicals(id, name)")
    .eq("owner_id", user.id);
  const normName = name.toLowerCase().trim();
  const dup = (myRecs || []).find((r: any) => (r.canonicals?.name || "").toLowerCase().trim() === normName);
  if (dup) {
    await sendText(from, '"' + name + '" is already in your library ✓');
    return json({ ok: true });
  }

  // ── embed for meaning-search ───────────────────────────────────────────────
  let embedding: number[] | null = null;
  try {
    const emb = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-large", dimensions: 1536,
        input: [name, location, note, tags.join(", ")].filter(Boolean).join(" | "),
      }),
    });
    if (emb.ok) { const e = await emb.json(); embedding = e.data?.[0]?.embedding ?? null; }
  } catch (_) { /* best-effort */ }

  // ── write canonical + recommendation ───────────────────────────────────────
  const canInsert: Record<string, unknown> = {
    type: "place", name, category: "", location, image_emoji: "📌",
    created_by: user.id, primary_category: category, ai_tags: tags,
    class_source: "ai", classified_at: new Date().toISOString(),
    website_url: urlMatch ? urlMatch[0].slice(0, 300) : null,
    image_url: imageUrl,
  };
  if (embedding) canInsert.embedding = embedding;
  const { data: canRow, error: canErr } = await admin
    .from("canonicals").insert(canInsert).select("id").single();
  if (canErr || !canRow) {
    await sendText(from, "Something went wrong saving that — try again.");
    return json({ ok: true });
  }
  await admin.from("recommendations").insert({
    owner_id: user.id, canonical_id: canRow.id, circle_id: null,
    recommended_by_user_id: user.id,
    note, rating: null, tags, status: "saved", is_anonymous: false, degree: 1,
    shared_to_network: user.share_by_default !== false,
    rec_date: new Date().toISOString().slice(0, 10),
  });

  const catLabel = category.charAt(0).toUpperCase() + category.slice(1);
  await sendText(from, "✓ Saved to your library: " + name + (location ? " · " + location : "") + " (" + catLabel + ")");
  return json({ ok: true });
});
