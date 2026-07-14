// ============================================================================
// POST /functions/v1/classify-rec
// Understands a recommendation ITEM: fixed primary category + free tags +
// a 1536-dim meaning vector. Called by the app at save time (and lazily on
// view for older items). Auth: caller JWT. Writes via service role.
// Requires secret: OPENAI_API_KEY
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];

interface Body { canonical_id: string; note?: string; context?: string; }

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ skipped: true, reason: "openai_not_configured" });

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  if (!body.canonical_id) return err("canonical_id required");

  const admin = adminClient();
  const { data: can } = await admin
    .from("canonicals").select("*").eq("id", body.canonical_id).single();
  if (!can) return err("canonical_not_found", 404);

  const itemText = [
    can.name,
    can.category ? "type: " + can.category : "",
    can.location ? "location: " + can.location : "",
    body.note ? "note: " + body.note : "",
    body.context ? 'recommended in answer to the question: "' + String(body.context).slice(0, 150) + '"' : "",
  ].filter(Boolean).join(" | ");

  // ── 1. Classify (GPT-4o-mini, strict JSON) ────────────────────────────────
  // On ANY OpenAI failure we return the error and write NOTHING —
  // a failed call must never masquerade as a real classification.
  let category = "other";
  let tags: string[] = [];
  let aiError: string | null = null;
  try {
    const chat = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You classify recommendation items (restaurants, books, doctors, hotels, services...). " +
              "The item text may be in Hebrew or English. Respond with JSON only: " +
              '{"category": one of [' + CATEGORIES.map((c) => '"' + c + '"').join(",") + "], " +
              '"tags": [3-6 short lowercase tags in the SAME language as the item]}. ' +
              "category is what the item IS (a restaurant recommended during a trip is dining, not travel).",
          },
          { role: "user", content: itemText },
        ],
      }),
    });
    if (chat.ok) {
      const c = await chat.json();
      const parsed = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
      if (CATEGORIES.includes(parsed.category)) category = parsed.category;
      if (Array.isArray(parsed.tags)) {
        tags = parsed.tags.filter((t: unknown) => typeof t === "string").slice(0, 6);
      }
    } else {
      const detail = await chat.text();
      aiError = "openai_" + chat.status + ": " + detail.slice(0, 200);
    }
  } catch (e) {
    aiError = "openai_exception: " + String(e).slice(0, 150);
  }
  if (aiError) return json({ error: aiError }, 502);

  // ── 2. Embed (text-embedding-3-large @ 1536 dims) ─────────────────────────
  let embedding: number[] | null = null;
  try {
    const emb = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        dimensions: 1536,
        input: itemText + (tags.length ? " | tags: " + tags.join(", ") : ""),
      }),
    });
    if (emb.ok) {
      const e = await emb.json();
      embedding = e.data?.[0]?.embedding ?? null;
    }
  } catch (_) { /* embedding is best-effort */ }

  // ── 3. Persist — never overwrite a human correction ───────────────────────
  const update: Record<string, unknown> = {
    ai_tags: tags,
    classified_at: new Date().toISOString(),
  };
  if (can.class_source !== "user") {
    update.primary_category = category;
    update.class_source = "ai";
  }
  if (embedding) update.embedding = embedding;

  await admin.from("canonicals").update(update).eq("id", body.canonical_id);

  return json({
    category: can.class_source === "user" ? can.primary_category : category,
    tags,
    embedded: !!embedding,
  });
});
