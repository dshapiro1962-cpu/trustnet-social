// ============================================================================
// POST /functions/v1/build-sheet          engine: sheet-v4
// The Answer Sheet, archetype-aware.
//
//  DISCOVERY   ("who's a good electrician?")  -> answers CONTAIN the entities.
//              Behaves as sheet-v3: candidate items, categorised, corroborated.
//  VERIFICATION("is Avoriaz 1800 good for families?") -> the entity is in the
//              QUESTION. The sheet resolves that subject once (AI + Google
//              Places), returns it as a single real item, and attaches every
//              answer to it as a verdict. A sentence NEVER becomes an entity.
//  ADVICE      ("what should we do in Paris with kids?") -> items plus a
//              separate advice section, so useful prose isn't discarded.
//
// Auth: caller JWT (must own the query). Secrets: OPENAI_API_KEY, GOOGLE_PLACES_API_KEY
// ============================================================================
import { adminClient, userClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];
const ENGINE = "sheet-v4";

interface Body { query_id: string; }

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
// A recommendation name is an ENTITY, not a sentence. Long, verby strings are
// testimony — they must never become canonicals (the Avoriaz lesson).
function looksLikeSentence(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).length;
  if (words >= 7) return true;
  if (/[.!?]$/.test(t) && words >= 4) return true;
  if (/^(yes|no|yeah|sure|definitely|absolutely|כן|לא|בהחלט)\b/i.test(t)) return true;
  return false;
}

async function classifyQuery(key: string, text: string): Promise<{
  archetype: "discovery" | "verification" | "advice";
  subject: string; subject_hint: string;
}> {
  const fallback = { archetype: "discovery" as const, subject: "", subject_hint: "" };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content:
            "Classify a question someone asked their trusted circle. Return JSON only: " +
            '{"archetype":"discovery"|"verification"|"advice","subject":"...","subject_hint":"..."}. ' +
            "discovery = asks WHO/WHAT to choose, answers will name new places/people " +
            '(e.g. "who is a good electrician?", "best pizza in Tel Aviv?"). ' +
            "verification = asks about ONE named thing already in the question " +
            '(e.g. "is Avoriaz 1800 good for families?", "is Dr Cohen any good?"). ' +
            "advice = asks for guidance/tips rather than a single choice " +
            '(e.g. "what should we do in Paris with kids?"). ' +
            'For verification, "subject" = the exact named thing (e.g. "Avoriaz 1800") and ' +
            '"subject_hint" = a few words describing what it is for a maps/web lookup ' +
            '(e.g. "ski resort France"). For other archetypes both may be "". ' +
            "Questions may be Hebrew or English.",
        }, { role: "user", content: String(text).slice(0, 300) }],
      }),
    });
    if (!r.ok) return fallback;
    const c = await r.json();
    const p = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
    const arch = ["discovery", "verification", "advice"].includes(p.archetype) ? p.archetype : "discovery";
    return {
      archetype: arch,
      subject: typeof p.subject === "string" ? p.subject.slice(0, 80).trim() : "",
      subject_hint: typeof p.subject_hint === "string" ? p.subject_hint.slice(0, 60).trim() : "",
    };
  } catch (_) { return fallback; }
}

// Best-effort: turn a subject name into a real place (category + location + link).
async function resolvePlace(name: string, hint: string): Promise<
  { name: string; location: string; category: string | null } | null
> {
  const gkey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!gkey || !name) return null;
  try {
    const q = encodeURIComponent([name, hint].filter(Boolean).join(" "));
    const r = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${gkey}`,
    );
    if (!r.ok) return null;
    const d = await r.json();
    const hit = (d.results || [])[0];
    if (!hit) return null;
    const types: string[] = hit.types || [];
    let category: string | null = null;
    if (types.some((t) => ["restaurant","cafe","bar","bakery","food","meal_takeaway"].includes(t))) category = "dining";
    else if (types.some((t) => ["lodging","travel_agency","airport","tourist_attraction","natural_feature"].includes(t))) category = "travel";
    else if (types.some((t) => ["doctor","hospital","dentist","pharmacy","physiotherapist","health"].includes(t))) category = "healthcare";
    else if (types.some((t) => ["museum","art_gallery","movie_theater","library","church","synagogue"].includes(t))) category = "culture";
    else if (types.some((t) => ["gym","park","stadium","campground","ski_resort"].includes(t))) category = "hobbies";
    else if (types.some((t) => ["plumber","electrician","painter","roofing_contractor","locksmith","moving_company"].includes(t))) category = "home";
    return {
      name: hit.name || name,
      location: hit.formatted_address || "",
      category,
    };
  } catch (_) { return null; }
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  if (!body.query_id) return err("query_id required");

  const supa = userClient(req);
  const { data: q } = await supa.from("queries").select("*").eq("id", body.query_id).single();
  if (!q) return err("query_not_found", 404);

  const admin = adminClient();

  // ── responses ───────────────────────────────────────────────────────────
  const { data: respRows } = await admin
    .from("query_responses").select("*")
    .eq("query_id", body.query_id).not("responded_at", "is", null);
  const responses = respRows || [];
  const memberIds = [...new Set(responses.map((r: any) => r.member_id).filter(Boolean))];
  const memberNames: Record<string, string> = {};
  if (memberIds.length) {
    const { data: mems } = await admin.from("members").select("id,name").in("id", memberIds);
    for (const m of mems || []) memberNames[m.id] = m.name;
  }
  const whoOf = (r: any) =>
    r.is_anonymous ? "Someone (anonymous)" : (memberNames[r.member_id as string] || "Someone");

  // ── archetype + subject (the v4 heart) ──────────────────────────────────
  const cls = key ? await classifyQuery(key, q.text) : { archetype: "discovery" as const, subject: "", subject_hint: "" };
  let subjectItem: Record<string, unknown> | null = null;
  if (cls.archetype === "verification" && cls.subject) {
    const place = await resolvePlace(cls.subject, cls.subject_hint);
    subjectItem = {
      name: place?.name || cls.subject,
      location: place?.location || "",
      category: place?.category || "other",
      emoji: "📌",
      from_you: false,
      recommenders: [] as string[],
      notes: [] as { by: string; note: string }[],
      verdicts: [] as { by: string; verdict: string; note: string }[],
      rating: 0, rec_id: null, member_id: null,
      is_subject: true,
      resolved: !!place,
    };
  }

  // ── own-library semantic matches (unchanged recall path) ────────────────
  type LibItem = {
    rec_id: string; canonical_id: string; name: string; location: string;
    category: string | null; user_filed?: boolean; tags?: string[]; origin?: string;
    emoji: string; note: string; rating: number;
  };
  let library: LibItem[] = [];
  if (key) {
    try {
      const emb = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-large", dimensions: 1536, input: q.text }),
      });
      if (emb.ok) {
        const e = await emb.json();
        const vector = e.data?.[0]?.embedding;
        if (vector) {
          const minSim = Math.max(0.25, parseFloat(Deno.env.get("SEARCH_MIN_SIMILARITY") ?? "0.3") - 0.05);
          const { data: hits } = await admin.rpc("match_user_recs", {
            p_user: userId, p_embedding: vector, p_limit: 15,
          });
          const good = (hits || []).filter((h: { similarity: number }) => h.similarity >= minSim);
          if (good.length) {
            const recIds = good.map((h: { rec_id: string }) => h.rec_id);
            const { data: recs } = await admin
              .from("recommendations")
              .select("id, note, rating, canonical_id, query_id, canonicals(id, name, location, image_emoji, primary_category, ai_tags, class_source)")
              .in("id", recIds);
            const originIds = [...new Set((recs || []).map((r: Record<string, unknown>) => r.query_id).filter(Boolean))];
            const originText: Record<string, string> = {};
            if (originIds.length) {
              const { data: oq } = await admin.from("queries").select("id,text").in("id", originIds);
              for (const o of oq || []) originText[o.id] = o.text;
            }
            library = (recs || []).map((r: Record<string, unknown>) => {
              const cn = r.canonicals as Record<string, unknown> | null;
              return {
                rec_id: r.id as string, canonical_id: r.canonical_id as string,
                name: (cn?.name as string) || "", location: (cn?.location as string) || "",
                category: (cn?.primary_category as string) || null,
                user_filed: (cn?.class_source as string) === "user",
                tags: Array.isArray(cn?.ai_tags) ? (cn?.ai_tags as string[]) : [],
                origin: r.query_id ? (originText[r.query_id as string] || "") : "",
                emoji: (cn?.image_emoji as string) || "📌",
                note: (r.note as string) || "", rating: (r.rating as number) || 0,
              };
            });
          }
        }
      }
    } catch (_) { /* best effort */ }
  }

  // ── VERIFICATION: answers are testimony about ONE subject ───────────────
  if (subjectItem) {
    let yes = 0, no = 0, mixed = 0;
    for (const r of responses) {
      const who = whoOf(r);
      const raw = [r.rec_name, r.rec_note].filter(Boolean).join(" — ").trim();
      if (!raw) continue;
      const low = raw.toLowerCase();
      const verdict =
        /^(no|not|nope|לא|ממש לא)\b/.test(low) ? "no"
        : /\b(but|however|though|אבל|למרות)\b/.test(low) ? "mixed"
        : "yes";
      if (verdict === "yes") yes++; else if (verdict === "no") no++; else mixed++;
      (subjectItem.verdicts as { by: string; verdict: string; note: string }[])
        .push({ by: who, verdict, note: raw });
      (subjectItem.notes as { by: string; note: string }[]).push({ by: who, note: raw });
      const recs = subjectItem.recommenders as string[];
      if (!recs.includes(who)) recs.push(who);
    }
    subjectItem.consensus = { yes, no, mixed, total: yes + no + mixed };

    // A library item the user already has for this subject? merge it in.
    const subjNorm = norm(subjectItem.name as string);
    const owned = library.find((l) => norm(l.name) === subjNorm);
    if (owned) {
      subjectItem.from_you = true;
      subjectItem.rec_id = owned.rec_id;
      subjectItem.rating = owned.rating;
      if (owned.note) (subjectItem.notes as { by: string; note: string }[]).unshift({ by: "You", note: owned.note });
      if (!subjectItem.location) subjectItem.location = owned.location;
      if (owned.category) subjectItem.category = owned.category;
    }
    // Related library items (excluding the subject itself) stay as context.
    const related = library
      .filter((l) => norm(l.name) !== subjNorm)
      .map((l) => ({
        name: l.name, location: l.location, category: l.category || "other", emoji: l.emoji,
        from_you: true, recommenders: [] as string[],
        notes: l.note ? [{ by: "You", note: l.note }] : [],
        rating: l.rating, rec_id: l.rec_id, member_id: null,
      }));

    return json({
      engine: ENGINE, archetype: "verification",
      subject: subjectItem.name, subject_resolved: subjectItem.resolved,
      query_text: q.text, judge_error: null,
      counts: {
        total: 1 + related.length,
        answers: (subjectItem.verdicts as unknown[]).length,
        from_circle: (subjectItem.recommenders as string[]).length,
        from_you: related.length, corroborated: 0, hidden: 0,
      },
      items: [subjectItem, ...related],
    });
  }

  // ── DISCOVERY / ADVICE: v3 behaviour + sentence guard + advice section ──
  type Pending = { idx: number; kind: "resp" | "lib"; text: string };
  const pending: Pending[] = [];
  const advice: { by: string; note: string }[] = [];
  const entityResponses: { r: any; i: number }[] = [];

  responses.forEach((r: any, i: number) => {
    // The guard that kills the "sentence becomes a canonical" bug class.
    if (looksLikeSentence(r.rec_name as string)) {
      const txt = [r.rec_name, r.rec_note].filter(Boolean).join(" — ").trim();
      if (txt) advice.push({ by: whoOf(r), note: txt });
      return;
    }
    entityResponses.push({ r, i });
    pending.push({ idx: i, kind: "resp", text: [r.rec_name, r.rec_location, r.rec_note].filter(Boolean).join(" | ") });
  });
  library.forEach((l, i) => {
    pending.push({ idx: i, kind: "lib", text: [
      l.name, l.location, l.note,
      l.tags && l.tags.length ? "tags: " + l.tags.join(", ") : "",
      l.origin ? 'originally answered the question: "' + l.origin.slice(0, 120) + '"' : "",
    ].filter(Boolean).join(" | ") });
  });

  const respCats: Record<number, string> = {};
  const libRelevant: Record<number, boolean> = {};
  let judgeError: string | null = null;
  if (key && pending.length) {
    try {
      const chat = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" },
          messages: [
            { role: "system", content:
                "Someone asked their trusted circle: \"" + String(q.text).slice(0, 200) + "\". " +
                "For EACH candidate item return: category — one of [" +
                CATEGORIES.map((c) => '"' + c + '"').join(",") + "] describing what the item IS " +
                "(a restaurant is dining even on a trip; a hotel is travel; a museum is culture); " +
                "and relevant — true only if it plausibly answers THIS question. " +
                "Some items note the question they ORIGINALLY answered — strong evidence of what they are. " +
                "If the question is specific and you cannot tell what an item is, mark it NOT relevant. " +
                "Items may be Hebrew or English. " +
                'Respond JSON only: {"results":[{"category":"...","relevant":true|false}, ...same order]}' },
            { role: "user", content: JSON.stringify(pending.map((p) => p.text)) },
          ],
        }),
      });
      if (chat.ok) {
        const c = await chat.json();
        const parsed = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
        let results = Array.isArray(parsed.results) ? parsed.results : null;
        if (!results && Array.isArray(parsed.categories)) {
          results = parsed.categories.map((cat: unknown) => ({ category: cat, relevant: true }));
        }
        if (!results) {
          judgeError = "unexpected_judge_output";
          library.forEach((_, i) => { libRelevant[i] = true; });
        } else {
          pending.forEach((p, i) => {
            const r = results![i] || {};
            const cat = CATEGORIES.includes(r.category) ? r.category : "other";
            if (p.kind === "resp") respCats[p.idx] = cat;
            else {
              if (!library[p.idx].user_filed) library[p.idx].category = cat;
              libRelevant[p.idx] = r.relevant !== false;
            }
          });
        }
      } else {
        judgeError = "openai_" + chat.status;
        library.forEach((_, i) => { libRelevant[i] = true; });
      }
    } catch (e) {
      judgeError = "judge_exception: " + String(e).slice(0, 100);
      library.forEach((_, i) => { libRelevant[i] = true; });
    }
  } else {
    if (pending.length) judgeError = key ? null : "openai_not_configured";
    library.forEach((_, i) => { libRelevant[i] = true; });
  }

  const hiddenCount = library.filter((_, i) => libRelevant[i] === false).length;
  library = library.filter((_, i) => libRelevant[i] !== false);

  type SheetItem = {
    name: string; location: string; category: string; emoji: string;
    from_you: boolean; recommenders: string[];
    notes: { by: string; note: string }[];
    rating: number; rec_id: string | null; member_id: string | null;
  };
  const byName: Record<string, SheetItem> = {};
  for (const l of library) {
    byName[norm(l.name)] = {
      name: l.name, location: l.location, category: l.category || "other", emoji: l.emoji,
      from_you: true, recommenders: [],
      notes: l.note ? [{ by: "You", note: l.note }] : [],
      rating: l.rating, rec_id: l.rec_id, member_id: null,
    };
  }
  for (const { r, i } of entityResponses as { r: any; i: number }[]) {
    const keyName = norm(r.rec_name as string);
    if (!keyName) continue;
    const who = whoOf(r);
    const existing = byName[keyName];
    if (existing) {
      if (!existing.recommenders.includes(who)) existing.recommenders.push(who);
      if (r.rec_note) existing.notes.push({ by: who, note: r.rec_note as string });
      if (!existing.member_id) existing.member_id = (r.member_id as string) || null;
    } else {
      byName[keyName] = {
        name: r.rec_name as string, location: (r.rec_location as string) || "",
        category: respCats[i] || "other", emoji: (r.rec_emoji as string) || "📌",
        from_you: false, recommenders: [who],
        notes: r.rec_note ? [{ by: who, note: r.rec_note as string }] : [],
        rating: 0, rec_id: null, member_id: (r.member_id as string) || null,
      };
    }
  }

  const items = Object.values(byName);
  return json({
    engine: ENGINE, archetype: cls.archetype, subject: "", subject_resolved: false,
    judge_error: judgeError, query_text: q.text,
    advice,
    counts: {
      total: items.length,
      from_circle: items.filter((x) => x.recommenders.length > 0 && !x.from_you).length,
      from_you: items.filter((x) => x.from_you && x.recommenders.length === 0).length,
      corroborated: items.filter((x) => x.from_you && x.recommenders.length > 0).length,
      hidden: hiddenCount,
      advice: advice.length,
    },
    items,
  });
});
