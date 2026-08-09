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
//  enrich  { name, note?, location?, query_text? }  (circle_name ignored: provenance, not evidence)
//          -> { entity:{name,location,category,tags,search_doc,resolved}, duplicate_of? }
//  commit  { canonical_id, ...same inputs }   -> enriches AND writes to the row
//  backfill{ limit? }                         -> repairs the caller's own library
//
// Auth: caller JWT. Secrets: OPENAI_API_KEY, GOOGLE_PLACES_API_KEY
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

import { norm, enrichOne, embed } from "../_shared/enrich_core.ts";

const ENGINE = "librarian-v1";

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
    const offset = Math.max(0, Number(body.offset) || 0);
    const { data: recs } = await admin
      .from("recommendations")
      .select("id, note, query_id, circle_id, canonical_id, canonicals(id, name, location, primary_category, ai_tags, search_doc)")
      .eq("owner_id", userId)
      .limit(200);

    // force:true refreshes entries that ALREADY have a document — needed whenever
    // the enrichment improves, or when a merged comment added new context.
    const force = body.force === true;
    const todo = (recs || [])
      .filter((r: any) => r.canonicals && (force || !r.canonicals.search_doc))
      .slice(offset, offset + limit);
    if (!todo.length) {
      const total = (recs || []).length;
      const done = (recs || []).filter((r: any) => r.canonicals?.search_doc).length;
      return json({ engine: ENGINE, mode, force, repaired: 0, remaining: 0, total, done });
    }

    // context lookup: the QUESTION is evidence and enters the doc.
    // The circle is deliberately NOT fetched — provenance, not evidence.
    const qIds = [...new Set(todo.map((r: any) => r.query_id).filter(Boolean))];
    const qText: Record<string, string> = {};
    if (qIds.length) {
      const { data } = await admin.from("queries").select("id,text").in("id", qIds);
      for (const q of data || []) qText[q.id] = q.text;
    }

    let repaired = 0;
    const samples: { before: string; after: string }[] = [];
    for (const r of todo) {
      const cn = (r as any).canonicals;
      const e = await enrichOne(key, {
        name: cn.name || "", note: (r as any).note || "", location: cn.location || "",
        query_text: (r as any).query_id ? (qText[(r as any).query_id] || "") : "",
      });
      const vec = await embed(key, e.search_doc);
      const patch: Record<string, unknown> = {
        name: e.name, location: e.location, primary_category: e.category,
        ai_tags: e.tags, search_doc: e.search_doc, search_doc_at: new Date().toISOString(),
        verified: e.resolved === true,   // v0.42.0 — same grounding flag as commit
        kind: e.kind || null,            // v0.48.0 — backfill must persist it too
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
    const remaining = force
      ? Math.max(0, (recs || []).length - offset - repaired)
      : Math.max(0, (recs || []).filter((r: any) => r.canonicals && !r.canonicals.search_doc).length - repaired);
    return json({ engine: ENGINE, mode, force, repaired, remaining, samples });
  }

  // ── ENRICH / COMMIT ──────────────────────────────────────────────────────
  const input = {
    name: String(body.name || "").slice(0, 200),
    note: String(body.note || "").slice(0, 800),
    location: String(body.location || "").slice(0, 120),
    query_text: String(body.query_text || "").slice(0, 300),
    // circle_name intentionally ABSENT — circles are provenance, not evidence.
    // Clients may still send it; it is ignored. See enrich_core PRODUCT LAW.
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
      // v0.48.0: PERSIST kind. It has always been produced — "novel",
      // "children's book", "ski resort" — written into search_doc as text and
      // stored in no column. It is the only signal precise enough to tell a
      // book from a museum; primary_category puts both in 'culture'.
      kind: e.kind || null,
      search_doc: e.search_doc, search_doc_at: new Date().toISOString(),
      class_source: "ai", classified_at: new Date().toISOString(),
      // v0.42.0: PERSIST the grounding. enrichOne has always computed whether a
      // real source (web search or Google Places) confirmed this entity exists,
      // and the value was thrown away — so a confirmed restaurant and an
      // invented occupation looked identical downstream. canonicals.verified
      // has existed unused since 0001. Now it means something.
      verified: e.resolved === true,
    };
    if (vec) patch.embedding = vec;
    const { error } = await admin.from("canonicals").update(patch).eq("id", body.canonical_id as string);
    if (error) return err("commit_failed: " + error.message, 500);
  }

  return json({ engine: ENGINE, mode, entity: e, duplicate_of });
});
