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
import { libraryRecall } from "../_shared/library_recall.ts";

const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];
// sheet-v5: own-library recall moved onto search_library_hybrid + rerank
// (_shared/library_recall.ts). The client renders this string in the sheet
// header, so it is how a deploy is confirmed to have landed - the APP_VERSION
// of this function.
const ENGINE = "sheet-v7";

interface Body { query_id: string; }

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
// Two renderings of the same testimony. Containment counts only when the
// shorter side is long enough to be meaningful - otherwise a three-character
// note would swallow everything.
function sameNote(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length < y.length ? x : y;
  const longer = x.length < y.length ? y : x;
  return shorter.length >= 20 && longer.includes(shorter);
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
  archetype: "discovery" | "verification" | "comparison" | "advice";
  subjects: { name: string; hint: string }[];
  reference: string;
}> {
  const fallback = { archetype: "discovery" as const, subjects: [], reference: "" };
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("LIBRARIAN_MODEL") ?? "gpt-4o",
        temperature: 0, response_format: { type: "json_object" },
        messages: [{
          role: "system",
          content:
            "Classify a question someone asked their trusted circle. JSON only: " +
            '{"archetype":"discovery"|"verification"|"comparison"|"advice",' +
            '"subjects":[{"name":"...","hint":"..."}],"reference":"..."}. ' +
            "discovery = asks WHAT/WHO to choose; the answers will name new things " +
            '("recommend a good freeride ski", "museum in NYC"). subjects=[] . ' +
            "verification = asks about ONE named thing already in the question " +
            '("is Les Arcs good for beginners") -> subjects = that one thing. ' +
            "comparison = asks which of TWO OR MORE named things is better " +
            '("which is better, the Weber Spirit E-325 or the Napoleon Rogue 425") ' +
            "-> subjects = every named thing, in the order asked. " +
            "advice = asks for guidance with no thing to choose " +
            '("which season is good for visiting Israel"). subjects=[] . ' +
            'IMPORTANT "reference": when the question names something only as a ' +
            "COMPARISON POINT or a thing to move AWAY from, put it in reference and " +
            "leave subjects empty — the named thing must NOT be saved as the answer. " +
            'Examples: "I have been to La Grave, something similar in the US?" -> ' +
            'discovery, reference="La Grave". "disappointed with Santorini, alternative?" ' +
            '-> discovery, reference="Santorini". "loved Harry Potter, other books by the ' +
            'author?" -> discovery, reference="Harry Potter". ' +
            '"hint" = a few words for a maps/web lookup ("ski resort France", "gas grill"). ' +
            "Questions may be Hebrew or English.",
        }, { role: "user", content: String(text).slice(0, 300) }],
      }),
    });
    if (!r.ok) return fallback;
    const c = await r.json();
    const p = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
    const arch = ["discovery","verification","comparison","advice"].includes(p.archetype) ? p.archetype : "discovery";
    const subs = Array.isArray(p.subjects)
      ? p.subjects.filter((x: any) => x && typeof x.name === "string" && x.name.trim())
          .slice(0, 4)
          .map((x: any) => ({ name: String(x.name).slice(0, 80).trim(), hint: String(x.hint || "").slice(0, 60) }))
      : [];
    return {
      archetype: arch,
      subjects: subs,
      reference: typeof p.reference === "string" ? p.reference.slice(0, 80).trim() : "",
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
  const cls = key
    ? await classifyQuery(key, q.text)
    : { archetype: "discovery" as const, subjects: [] as { name: string; hint: string }[], reference: "" };

  // Verification (1 subject) and comparison (2+) share one shape: named things
  // from the QUESTION, with the answers attached to them as verdicts.
  type Subject = Record<string, unknown>;
  const subjects: Subject[] = [];
  if (cls.subjects.length) {
    for (const sub of cls.subjects) {
      const place = await resolvePlace(sub.name, sub.hint);
      subjects.push({
        name: place?.name || sub.name,
        raw_name: sub.name,
        location: place?.location || "",
        category: place?.category || "other",
        emoji: "\ud83d\udccc",
        from_you: false,
        recommenders: [] as string[],
        notes: [] as { by: string; note: string }[],
        verdicts: [] as { by: string; verdict: string; note: string }[],
        rating: 0, rec_id: null, member_id: null,
        is_subject: true,
        resolved: !!place,
      });
    }
  }

  // ── own-library matches, through the SAME engine as search ──────────────
  // WAS: match_user_recs — vector only, no threshold in the SQL at all, and a
  // caller-side floor of max(0.25, SEARCH_MIN_SIMILARITY - 0.05) = 0.25. On a
  // bilingual library that floor sits BELOW the similarity of two unrelated
  // items written in the same language (Hebrew<->Hebrew averages 0.354 on dan's
  // rows), so a Hebrew question retrieved a vet and a driving instructor for
  // being Hebrew, and excluded the Italian restaurants for being Latin (0.191).
  //
  // search_library_hybrid + rerank is the mechanism v0.25.0 introduced for
  // exactly this, in search-library, on 28 Jul. build-sheet is the last caller
  // that never moved to it. See _shared/library_recall.ts.
  type LibItem = {
    rec_id: string; canonical_id: string; name: string; location: string;
    category: string | null; user_filed?: boolean; tags?: string[]; origin?: string;
    emoji: string; note: string; rating: number; why?: string;
  };
  let library: LibItem[] = [];
  let recallError: string | null = null;
  {
    const recall = await libraryRecall(admin, key, userId, q.text, 10);
    recallError = recall.error;
    const canIds = recall.hits.map((h) => h.canonical_id).filter(Boolean);
    // The hybrid returns the catalogue fields but not the emoji or who filed
    // the category, both of which the sheet shows.
    const extra: Record<string, { emoji: string; class_source: string }> = {};
    if (canIds.length) {
      const { data: cans } = await admin
        .from("canonicals").select("id,image_emoji,class_source").in("id", canIds);
      for (const c of cans || []) {
        extra[c.id as string] = {
          emoji: (c.image_emoji as string) || "\ud83d\udccc",
          class_source: (c.class_source as string) || "",
        };
      }
    }
    library = recall.hits.map((h) => ({
      rec_id: h.rec_id, canonical_id: h.canonical_id,
      name: h.name, location: h.location || "",
      category: h.primary_category || null,
      user_filed: extra[h.canonical_id]?.class_source === "user",
      tags: Array.isArray(h.ai_tags) ? h.ai_tags : [],
      origin: "",
      emoji: extra[h.canonical_id]?.emoji || "\ud83d\udccc",
      note: h.note || "", rating: h.rating || 0, why: h.why || "",
    }));
  }

  // ── VERIFICATION: answers are testimony about ONE subject ───────────────
  if (subjects.length) {
    // Assign each answer to the subject it actually talks about. With two
    // subjects ("Weber or Napoleon?") an answer usually names one; answers that
    // name neither are general commentary and go to the advice section.
    const generalAdvice: { by: string; note: string }[] = [];
    for (const r of responses) {
      const who = whoOf(r);
      const raw = [r.rec_name, r.rec_note].filter(Boolean).join(" \u2014 ").trim();
      if (!raw) continue;
      const low = raw.toLowerCase();
      let target: Subject | null = null;
      for (const sj of subjects) {
        const n1 = String(sj.name).toLowerCase();
        const n2 = String(sj.raw_name).toLowerCase();
        // match on the whole name or on a distinctive word of it
        const words = n2.split(/\s+/).filter((w) => w.length >= 4);
        if (low.includes(n1) || low.includes(n2) || words.some((w) => low.includes(w))) { target = sj; break; }
      }
      if (!target && subjects.length === 1) target = subjects[0];
      if (!target) { generalAdvice.push({ by: who, note: raw }); continue; }

      const verdict =
        /^(no|not|nope|\u05dc\u05d0|\u05de\u05de\u05e9 \u05dc\u05d0)\b/.test(low) ? "no"
        : /\b(but|however|though|expensive|\u05d0\u05d1\u05dc|\u05d9\u05e7\u05e8)\b/.test(low) ? "mixed"
        : "yes";
      (target.verdicts as { by: string; verdict: string; note: string }[]).push({ by: who, verdict, note: raw });
      (target.notes as { by: string; note: string }[]).push({ by: who, note: raw });
      const recs = target.recommenders as string[];
      if (!recs.includes(who)) recs.push(who);
    }

    // consensus per subject + merge anything already in the library
    for (const sj of subjects) {
      const vs = sj.verdicts as { verdict: string }[];
      sj.consensus = {
        yes: vs.filter((v) => v.verdict === "yes").length,
        no: vs.filter((v) => v.verdict === "no").length,
        mixed: vs.filter((v) => v.verdict === "mixed").length,
        total: vs.length,
      };
      const owned = library.find((l) => norm(l.name) === norm(String(sj.name)));
      if (owned) {
        sj.from_you = true;
        sj.rec_id = owned.rec_id;
        sj.rating = owned.rating;
        if (owned.note) (sj.notes as { by: string; note: string }[]).unshift({ by: "You", note: owned.note });
        if (!sj.location) sj.location = owned.location;
        if (owned.category) sj.category = owned.category;
      }
    }

    const subjNames = subjects.map((sj) => norm(String(sj.name)));
    const related = library
      .filter((l) => !subjNames.includes(norm(l.name)))
      .map((l) => ({
        name: l.name, location: l.location, category: l.category || "other", emoji: l.emoji,
        from_you: true, recommenders: [] as string[],
        notes: l.note ? [{ by: "You", note: l.note }] : [],
        rating: l.rating, rec_id: l.rec_id, member_id: null,
      }));

    return json({
      engine: ENGINE,
      archetype: subjects.length > 1 ? "comparison" : "verification",
      subject: subjects[0].name,
      subject_count: subjects.length,
      subject_resolved: subjects.every((sj) => sj.resolved),
      query_text: q.text, judge_error: null,
      advice: generalAdvice,
      counts: {
        total: subjects.length + related.length,
        answers: subjects.reduce((n, sj) => n + (sj.verdicts as unknown[]).length, 0),
        from_circle: subjects.reduce((n, sj) => n + (sj.recommenders as string[]).length, 0),
        from_you: related.length, corroborated: 0, hidden: 0,
        advice: generalAdvice.length,
      },
      items: [...subjects, ...related],
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
  // LIBRARY ITEMS ARE NO LONGER JUDGED HERE. libraryRecall has already ranked
  // them for intent against this question, with a prompt that can read
  // provenance, and it returns nothing at all when it cannot judge. Asking a
  // second, weaker judge to re-filter them is what used to fail open.

  const respCats: Record<number, string> = {};
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
        } else {
          pending.forEach((p, i) => {
            const r = results![i] || {};
            const cat = CATEGORIES.includes(r.category) ? r.category : "other";
            if (p.kind === "resp") respCats[p.idx] = cat;
          });
        }
      } else {
        judgeError = "openai_" + chat.status;
      }
    } catch (e) {
      judgeError = "judge_exception: " + String(e).slice(0, 100);
    }
  } else {
    if (pending.length) judgeError = key ? null : "openai_not_configured";
  }

  // Nothing is filtered after the fact any more: an item is in `library`
  // only because the recall rerank put it there.
  const hiddenCount = 0;

  // A REFERENCE is the thing the asker is moving away from or comparing to
  // ("something like La Grave", "alternative to Santorini", "books by the Harry
  // Potter author"). It must never be offered back as the answer.
  const refNorm = norm(cls.reference || "");
  // EXACT, NOT CONTAINED (fixed v0.90.0). This dropped anything whose name
  // merely CONTAINED the reference. On "bridge in Brooklyn" the classifier
  // returns reference "Brooklyn", and "brooklyn bridge".includes("brooklyn")
  // is true - so the Brooklyn Bridge was deleted as though it were the thing
  // being compared against. Same for Hampstead Heath under "Hampstead": two of
  // the forty answers in the 13 Sep eval vanished this way.
  //
  // A reference is one named thing ("something like La Grave"). An answer that
  // merely mentions it is a DIFFERENT thing and is exactly what was asked for.
  if (refNorm) {
    library = library.filter((l) => norm(l.name) !== refNorm);
  }

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
    if (refNorm && keyName === refNorm) continue; // the reference is not an answer
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

  // ── DO I ALREADY OWN WHAT THEY NAMED? ───────────────────────────────────
  // The corroboration above is string equality on the normalised name, so it
  // only fires when the answer is spelled exactly as the library holds it.
  // may's answer "מאטרה, בארי, פוליאנו אה מארה, Alberobello" and the library's
  // "מאטרה" are the same place and never matched.
  //
  // match_canonical is the entity resolver the rest of the app already uses —
  // phone key, then trigram similarity on name with a location guard. It needs
  // no embedding, no threshold of ours and no model, so it cannot drift and it
  // cannot return a vet: it only ever answers about the things the circle
  // actually named. Verified against dan's real rows, 12 Sep 2026 — both
  // answers to the Apulia query resolved and both were correctly found held.
  for (const [k, it] of Object.entries(byName)) {
    if (it.rec_id || it.from_you) continue;          // already known to be held
    const { data: canId } = await admin.rpc("match_canonical", {
      p_name: it.name, p_location: it.location || null, p_phone: null,
    });
    if (!canId) continue;
    const { data: owned } = await admin
      .from("recommendations")
      .select("id, rating, note")
      .eq("owner_id", userId).eq("canonical_id", canId)
      .limit(1);
    const mine = (owned || [])[0];
    if (!mine) continue;
    byName[k] = {
      ...it,
      from_you: true,
      rec_id: mine.id as string,
      rating: it.rating || ((mine.rating as number) || 0),
      // SAME WORDS, DIFFERENT WRAPPER. The library copy of an answer is
      // stored prefixed with who said it ("Tom Shapiro: ..."), while the
      // response note is the bare text, so exact equality never matched and
      // Tom's whole trip narrative appeared twice on his own sheet.
      notes: mine.note && !it.notes.some((n) => sameNote(n.note, mine.note as string))
        ? [...it.notes, { by: "You", note: mine.note as string }]
        : it.notes,
    };
  }

  const items = Object.values(byName);
  return json({
    engine: ENGINE, archetype: cls.archetype, subject: "", subject_resolved: false,
    reference: cls.reference || "",
    // recall_error is separate from judge_error: the first says why the
    // "from your library" section is empty, the second why answers may be
    // uncategorised. Conflating them is how a retrieval failure used to read
    // as a categorisation failure.
    judge_error: judgeError, recall_error: recallError, query_text: q.text,
    advice,
    counts: {
      total: items.length,
      // WHAT THE CIRCLE NAMED, WHETHER OR NOT YOU HAVE SINCE KEPT IT.
      //
      // This used to exclude anything already in the library, so on dan's
      // Apulia sheet - may answered, Tom answered, both answers kept - the
      // header read "0 from your circle" over three items, two of which came
      // from his circle.
      //
      // It got worse the moment saving from the Inbox started working
      // (v0.89.0): the natural order is read the answers, keep them, THEN open
      // the sheet, which moved every answer out of this count. The one sheet
      // that matters most always said zero.
      //
      // corroborated still means the overlap - they named it AND you hold it -
      // so the two numbers deliberately overlap now rather than partition.
      from_circle: items.filter((x) => x.recommenders.length > 0).length,
      from_you: items.filter((x) => x.from_you && x.recommenders.length === 0).length,
      corroborated: items.filter((x) => x.from_you && x.recommenders.length > 0).length,
      hidden: hiddenCount,
      advice: advice.length,
    },
    items,
  });
});
