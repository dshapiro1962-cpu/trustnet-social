// ============================================================================
// /functions/v1/extract-chat-recs        engine: extract-chat-recs-v1
// Auth: caller JWT. Two modes:
//  { mode:"extract", source, messages:[{d,s,t}...] }  → AI-mines a chat batch
//    for recommendations → { items:[{name,category,location,note,phone}...] }
//  { mode:"save", items, circle_id|null, source, collection_title }
//    → inserts canonicals+recommendations (dedup by name), optional collection
//    → { saved, skipped, collection_token? }
// Privacy rules enforced in the prompt: no member names in notes, minors
// excluded, only service-provider phone numbers kept.
// OBSERVABILITY DOCTRINE: provider failures are logged VERBATIM.
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "extract-chat-recs-v1";
const CATEGORIES = ["dining", "travel", "healthcare", "home", "culture", "hobbies", "professional", "other"];

interface Msg { d: string; s: string; t: string; }
interface Item { name: string; category: string; location: string; note: string; phone: string; }

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: any;
  try { body = await req.json(); } catch { return err("invalid_json"); }

  const admin = adminClient();

  // ── MODE: extract ──────────────────────────────────────────────────────────
  if (body.mode === "extract") {
    const msgs: Msg[] = Array.isArray(body.messages) ? body.messages.slice(0, 200) : [];
    if (!msgs.length) return err("messages_required");
    const key = Deno.env.get("OPENAI_API_KEY");
    const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
    if (!key) return err("openai_key_missing", 500);

    const transcript = msgs.map((m) => "[" + m.d + "] " + m.s + ": " + m.t).join("\n");
    let items: Item[] = [];
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
                "You are mining a WhatsApp group-chat transcript (Hebrew and/or English) for RECOMMENDATIONS " +
                "of services, professionals, places, or products (doctors, plumbers, restaurants, shops, sitters...). " +
                "Return JSON only: {\"items\": [{\"name\": provider/place name, " +
                "\"category\": one of [" + CATEGORIES.map((c) => '"' + c + '"').join(",") + "], " +
                "\"location\": city/street or \"\", " +
                "\"note\": <=140 chars in the content language capturing WHY it was recommended, " +
                "\"phone\": the provider's phone if present in the messages else \"\", " +
                "\"confident\": true|false}]}. " +
                "STRICT PRIVACY RULES: " +
                "(1) NEVER include the names of chat participants in notes — use generic attribution like 'הומלץ בקבוצה'. " +
                "(2) EXCLUDE entirely anyone described as a minor/child/teen (e.g. a 13-year-old babysitter). " +
                "(3) phone numbers only for the recommended provider, never for group members chatting. " +
                "(4) Only actual recommendations/endorsements — not questions, complaints, items for sale, or lost&found. " +
                "If nothing qualifies, return {\"items\": []}.",
            },
            { role: "user", content: transcript },
          ],
        }),
      });
      if (!chat.ok) {
        const bodyText = await chat.text();
        console.error("extract_openai_http_error", chat.status, bodyText.slice(0, 500));
        return err("ai_error_" + chat.status + ": " + bodyText.slice(0, 200), 502);
      }
      const c = await chat.json();
      const out = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
      items = (Array.isArray(out.items) ? out.items : [])
        .filter((it: any) => it && typeof it.name === "string" && it.name.trim() && it.confident !== false)
        .map((it: any) => ({
          name: String(it.name).slice(0, 80).trim(),
          category: CATEGORIES.includes(it.category) ? it.category : "other",
          location: typeof it.location === "string" ? it.location.slice(0, 80) : "",
          note: typeof it.note === "string" ? it.note.slice(0, 140) : "",
          phone: typeof it.phone === "string" ? it.phone.slice(0, 25) : "",
        }));
    } catch (e) {
      console.error("extract_openai_exception", String(e).slice(0, 500));
      return err("ai_exception: " + String(e).slice(0, 200), 502);
    }
    return json({ engine: ENGINE, items, scanned: msgs.length });
  }

  // ── MODE: save ─────────────────────────────────────────────────────────────
  if (body.mode === "save") {
    const items: Item[] = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (!items.length) return err("items_required");
    const circleId: string | null = body.circle_id || null;
    const source: string = (typeof body.source === "string" && body.source.trim()) ? body.source.trim().slice(0, 60) : "WhatsApp chat";
    const collectionTitle: string = typeof body.collection_title === "string" ? body.collection_title.trim().slice(0, 80) : "";

    if (circleId) {
      const { data: circ } = await admin.from("circles").select("id, owner_id").eq("id", circleId).single();
      if (!circ || circ.owner_id !== userId) return err("circle_not_found_or_not_yours", 403);
    }

    const { data: mine } = await admin
      .from("recommendations").select("canonical_id, canonicals(name)").eq("owner_id", userId);
    const have = new Set((mine ?? []).map((r: any) => (r.canonicals?.name || "").toLowerCase().trim()).filter(Boolean));

    const today = new Date().toISOString().slice(0, 10);
    const sourceLabel = "\u05e7\u05d1\u05d5\u05e6\u05ea \u05d5\u05d5\u05d0\u05d8\u05e1\u05d0\u05e4 \u00b7 " + source;
    let saved = 0, skipped = 0;
    const recIds: string[] = [];

    for (const it of items) {
      const norm = it.name.toLowerCase().trim();
      if (!norm) continue;
      if (have.has(norm)) { skipped++; continue; }

      const { data: canRow, error: canErr } = await admin.from("canonicals").insert({
        type: "place", name: it.name, category: "", location: it.location || "",
        image_emoji: "\u{1F4CC}", created_by: userId,
        primary_category: CATEGORIES.includes(it.category) ? it.category : "other",
        class_source: "ai", classified_at: new Date().toISOString(),
        website_url: null, image_url: null,
      }).select("id").single();
      if (canErr || !canRow) {
        console.error("save_canonical_error", it.name, canErr?.message);
        return err("save_failed_at_" + it.name.slice(0, 30) + ": " + (canErr?.message || "unknown"), 500);
      }
      const note = it.note + (it.phone ? (it.note ? " \u00b7 " : "") + it.phone : "");
      const { data: recRow, error: recErr } = await admin.from("recommendations").insert({
        owner_id: userId, canonical_id: canRow.id, circle_id: circleId,
        recommended_by_user_id: userId, note, rating: null,
        status: "saved", is_anonymous: false, degree: 1,
        shared_to_network: false, rec_date: today, source_label: sourceLabel,
      }).select("id").single();
      if (recErr || !recRow) {
        console.error("save_rec_error", it.name, recErr?.message);
        return err("save_failed_at_" + it.name.slice(0, 30) + ": " + (recErr?.message || "unknown"), 500);
      }
      have.add(norm);
      recIds.push(recRow.id);
      saved++;
    }

    let collectionToken: string | null = null;
    if (collectionTitle && recIds.length) {
      collectionToken = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const { data: col, error: colErr } = await admin.from("collections").insert({
        owner_id: userId, token: collectionToken, title: collectionTitle,
        description: "\u05e0\u05d0\u05e1\u05e3 \u05de\u05e9\u05d9\u05d7\u05ea \u05d4\u05e7\u05d1\u05d5\u05e6\u05d4 \u2014 " + source,
      }).select("id").single();
      if (colErr || !col) {
        console.error("save_collection_error", colErr?.message);
        collectionToken = null; // items are saved; collection failure is non-fatal
      } else {
        const rows = recIds.map((rid, i) => ({ collection_id: col.id, rec_id: rid, position: i }));
        const { error: ciErr } = await admin.from("collection_items").insert(rows);
        if (ciErr) { console.error("save_collection_items_error", ciErr.message); }
      }
    }

    return json({ engine: ENGINE, saved, skipped, collection_token: collectionToken });
  }

  return err("unknown_mode");
});
