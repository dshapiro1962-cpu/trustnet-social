// ============================================================================
// POST /functions/v1/librarian                     engine: librarian-v1
//
// ONE service that turns anything into a well-formed library entry. Replaces
// the four drifting prompts (classify-rec, sheet judge, chat extract, ingest).
//
// The lesson that created it: "Avoriaz 1800" was saved with the word "ski"
// nowhere in it, so it could never be found by "good ski resort for children".
// Context that existed at save time — the question, the circle — was thrown
// away. The Librarian keeps it, in a SEARCH DOCUMENT.
//
// modes:
//  enrich  { name, note?, location?, query_text?, circle_name?, source? }
//          -> { entity:{name,location,category,tags,search_doc,resolved}, duplicate_of? }
//  commit  { canonical_id, ...same inputs }   -> enriches AND writes to the row
//  backfill{ limit? }                         -> repairs the caller's own library
//
// Auth: caller JWT. Secrets: OPENAI_API_KEY, GOOGLE_PLACES_API_KEY
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "librarian-v1";
const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];
const EMB_MODEL = "text-embedding-3-large";

interface Enriched {
  name: string; location: string; category: string; tags: string[];
  search_doc: string; resolved: boolean; kind: string;
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// A recommendation name is an ENTITY, never a sentence (the Avoriaz rule).
function looksLikeSentence(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).length;
  if (words >= 7) return true;
  if (/[.!?]$/.test(t) && words >= 4) return true;
  if (/^(yes|no|yeah|sure|definitely|absolutely|כן|לא|בהחלט)\b/i.test(t)) return true;
  return false;
}

// The search document: everything a future question might reasonably use.
function buildSearchDoc(e: {
  name: string; location: string; category: string; kind: string;
  tags: string[]; note: string; query_text: string; circle_name: string;
}): string {
  return [
    e.name,
    e.kind,
    e.location,
    e.category,
    (e.tags || []).join(" "),
    e.note,
    e.query_text ? "asked: " + e.query_text : "",
    e.circle_name ? "circle: " + e.circle_name : "",
  ].filter(Boolean).join(" · ").slice(0, 2000);
}

async function aiEnrich(key: string, input: {
  name: string; note: string; location: string; query_text: string; circle_name: string;
}): Promise<{ name: string; kind: string; category: string; tags: string[]; location: string } | null> {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("LIBRARIAN_MODEL") ?? "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "You are a librarian turning a recommendation into a findable catalogue entry. " +
            "Return JSON only: {\"name\":\"...\",\"kind\":\"...\",\"category\":\"...\",\"location\":\"...\",\"tags\":[\"...\"]}. " +
            "name = the ENTITY only (a place/person/product/title), cleaned of verdict words. " +
            "Never return a sentence as a name. " +
            "kind = 2-4 words saying what it IS, in the content language AND English if different " +
            "(e.g. \"ski resort\", \"רופאת עור dermatologist\", \"shakshouka restaurant\"). " +
            "category = one of [" + CATEGORIES.map((c) => '"' + c + '"').join(",") + "]. " +
            "location = city/region/country if determinable, else \"\". " +
            "tags = 4-10 SHORT search words a person might later use to find this: the type, " +
            "the audience, the occasion, distinguishing features, the domain. " +
            "CRITICAL: include the words implied by the CONTEXT even when absent from the text — " +
            "an item asked about in a ski circle must carry \"ski\"; one praised for children must " +
            "carry \"family\" and \"kids\". Include both Hebrew and English forms of key words when " +
            "the content is Hebrew. Tags are what makes it findable later." },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!r.ok) return null;
    const c = await r.json();
    const p = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
    if (!p || typeof p.name !== "string" || !p.name.trim()) return null;
    return {
      name: p.name.trim().slice(0, 100),
      kind: typeof p.kind === "string" ? p.kind.slice(0, 60) : "",
      category: CATEGORIES.includes(p.category) ? p.category : "other",
      location: typeof p.location === "string" ? p.location.slice(0, 120) : "",
      tags: Array.isArray(p.tags) ? p.tags.filter((t: unknown) => typeof t === "string").slice(0, 12).map((t: string) => t.slice(0, 30)) : [],
    };
  } catch (_) { return null; }
}

async function resolvePlace(name: string, hint: string): Promise<
  { name: string; location: string; category: string | null } | null
> {
  const gkey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!gkey || !name) return null;
  try {
    const q = encodeURIComponent([name, hint].filter(Boolean).join(" "));
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${gkey}`);
    if (!r.ok) return null;
    const d = await r.json();
    const hit = (d.results || [])[0];
    if (!hit) return null;
    const types: string[] = hit.types || [];
    let category: string | null = null;
    if (types.some((t) => ["restaurant","cafe","bar","bakery","food","meal_takeaway"].includes(t))) category = "dining";
    else if (types.some((t) => ["lodging","travel_agency","airport","tourist_attraction","natural_feature","ski_resort"].includes(t))) category = "travel";
    else if (types.some((t) => ["doctor","hospital","dentist","pharmacy","physiotherapist","health"].includes(t))) category = "healthcare";
    else if (types.some((t) => ["museum","art_gallery","movie_theater","library","church","synagogue"].includes(t))) category = "culture";
    else if (types.some((t) => ["gym","park","stadium","campground"].includes(t))) category = "hobbies";
    else if (types.some((t) => ["plumber","electrician","painter","roofing_contractor","locksmith","moving_company"].includes(t))) category = "home";
    return { name: hit.name || name, location: hit.formatted_address || "", category };
  } catch (_) { return null; }
}

async function embed(key: string, text: string): Promise<number[] | null> {
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMB_MODEL, dimensions: 1536, input: text.slice(0, 8000) }),
    });
    if (!r.ok) return null;
    const e = await r.json();
    return e.data?.[0]?.embedding ?? null;
  } catch (_) { return null; }
}

async function enrichOne(key: string, input: {
  name: string; note: string; location: string; query_text: string; circle_name: string;
}): Promise<Enriched> {
  const ai = key ? await aiEnrich(key, input) : null;
  let name = ai?.name || input.name;
  // Never let a sentence become an entity; fall back to the question's subject
  // when the answer text is testimony rather than a name.
  if (looksLikeSentence(name)) name = (ai?.name && !looksLikeSentence(ai.name)) ? ai.name : input.name;

  let location = ai?.location || input.location || "";
  let category = ai?.category || "other";
  const kind = ai?.kind || "";
  const tags = ai?.tags || [];
  let resolved = false;

  const place = await resolvePlace(name, [kind, location].filter(Boolean).join(" "));
  if (place) {
    resolved = true;
    name = place.name || name;
    location = place.location || location;
    if (place.category) category = place.category;
  }

  const search_doc = buildSearchDoc({
    name, location, category, kind, tags,
    note: input.note || "", query_text: input.query_text || "", circle_name: input.circle_name || "",
  });
  return { name, location, category, tags, search_doc, resolved, kind };
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return err("openai_key_missing", 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const mode = (body.mode as string) || "enrich";
  const admin = adminClient();

  // ── BACKFILL: repair everything already in the caller's library ──────────
  if (mode === "backfill") {
    const limit = Math.min(Number(body.limit) || 25, 50);
    const { data: recs } = await admin
      .from("recommendations")
      .select("id, note, query_id, circle_id, canonical_id, canonicals(id, name, location, primary_category, ai_tags, search_doc)")
      .eq("owner_id", userId)
      .limit(200);

    const todo = (recs || []).filter((r: any) => r.canonicals && !r.canonicals.search_doc).slice(0, limit);
    if (!todo.length) {
      const total = (recs || []).length;
      const done = (recs || []).filter((r: any) => r.canonicals?.search_doc).length;
      return json({ engine: ENGINE, mode, repaired: 0, remaining: 0, total, done });
    }

    // context lookups
    const qIds = [...new Set(todo.map((r: any) => r.query_id).filter(Boolean))];
    const cIds = [...new Set(todo.map((r: any) => r.circle_id).filter(Boolean))];
    const qText: Record<string, string> = {};
    const cName: Record<string, string> = {};
    if (qIds.length) {
      const { data } = await admin.from("queries").select("id,text").in("id", qIds);
      for (const q of data || []) qText[q.id] = q.text;
    }
    if (cIds.length) {
      const { data } = await admin.from("circles").select("id,name").in("id", cIds);
      for (const c of data || []) cName[c.id] = c.name;
    }

    let repaired = 0;
    const samples: { before: string; after: string }[] = [];
    for (const r of todo) {
      const cn = (r as any).canonicals;
      const e = await enrichOne(key, {
        name: cn.name || "", note: (r as any).note || "", location: cn.location || "",
        query_text: (r as any).query_id ? (qText[(r as any).query_id] || "") : "",
        circle_name: (r as any).circle_id ? (cName[(r as any).circle_id] || "") : "",
      });
      const vec = await embed(key, e.search_doc);
      const patch: Record<string, unknown> = {
        name: e.name, location: e.location, primary_category: e.category,
        ai_tags: e.tags, search_doc: e.search_doc, search_doc_at: new Date().toISOString(),
      };
      if (vec) patch.embedding = vec;
      const { error } = await admin.from("canonicals").update(patch).eq("id", cn.id);
      if (!error) {
        repaired++;
        if (samples.length < 5) samples.push({ before: cn.name, after: e.name });
      } else {
        console.error("backfill_update_failed", cn.id, error.message);
      }
    }
    const remaining = (recs || []).filter((r: any) => r.canonicals && !r.canonicals.search_doc).length - repaired;
    return json({ engine: ENGINE, mode, repaired, remaining: Math.max(0, remaining), samples });
  }

  // ── ENRICH / COMMIT ──────────────────────────────────────────────────────
  const input = {
    name: String(body.name || "").slice(0, 200),
    note: String(body.note || "").slice(0, 800),
    location: String(body.location || "").slice(0, 120),
    query_text: String(body.query_text || "").slice(0, 300),
    circle_name: String(body.circle_name || "").slice(0, 60),
  };
  if (!input.name && !input.query_text) return err("name_or_query_required");

  const e = await enrichOne(key, input);

  // duplicate detection against the caller's existing library
  let duplicate_of: string | null = null;
  const { data: mine } = await admin
    .from("recommendations").select("canonical_id, canonicals(id,name)").eq("owner_id", userId);
  for (const r of mine || []) {
    const cn = (r as any).canonicals;
    if (cn && norm(cn.name) === norm(e.name)) { duplicate_of = cn.id; break; }
  }

  if (mode === "commit" && body.canonical_id) {
    const vec = await embed(key, e.search_doc);
    const patch: Record<string, unknown> = {
      name: e.name, location: e.location, primary_category: e.category, ai_tags: e.tags,
      search_doc: e.search_doc, search_doc_at: new Date().toISOString(),
      class_source: "ai", classified_at: new Date().toISOString(),
    };
    if (vec) patch.embedding = vec;
    const { error } = await admin.from("canonicals").update(patch).eq("id", body.canonical_id as string);
    if (error) return err("commit_failed: " + error.message, 500);
  }

  return json({ engine: ENGINE, mode, entity: e, duplicate_of });
});
