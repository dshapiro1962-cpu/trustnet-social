// ============================================================================
// POST /functions/v1/build-sheet
// The Answer Sheet: for one query, assemble an integrated, categorized sheet
// from (a) circle responses and (b) the caller's OWN library items that
// semantically match the question — with corroboration merging when both
// sources agree on the same item.
// Auth: caller JWT (must own the query). Requires secret: OPENAI_API_KEY
// ============================================================================
import { adminClient, userClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];

interface Body { query_id: string; }

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  if (!body.query_id) return err("query_id required");

  // 1 ── the query (RLS: only the owner can read it)
  const supa = userClient(req);
  const { data: q } = await supa.from("queries").select("*").eq("id", body.query_id).single();
  if (!q) return err("query_not_found", 404);

  const admin = adminClient();

  // 2 ── circle responses (answered only) + responder names
  const { data: respRows } = await admin
    .from("query_responses").select("*")
    .eq("query_id", body.query_id).not("responded_at", "is", null);
  const responses = respRows || [];
  const memberIds = [...new Set(responses.map((r) => r.member_id).filter(Boolean))];
  const memberNames: Record<string, string> = {};
  if (memberIds.length) {
    const { data: mems } = await admin.from("members").select("id,name").in("id", memberIds);
    for (const m of mems || []) memberNames[m.id] = m.name;
  }

  // 3 ── own-library semantic matches for the query text
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
            // each item's birth certificate: the question it originally answered
            const originIds = [...new Set((recs || []).map((r: Record<string, unknown>) => r.query_id).filter(Boolean))];
            const originText: Record<string, string> = {};
            if (originIds.length) {
              const { data: oq } = await admin.from("queries").select("id,text").in("id", originIds);
              for (const o of oq || []) originText[o.id] = o.text;
            }
            library = (recs || []).map((r: Record<string, unknown>) => {
              const cn = r.canonicals as Record<string, unknown> | null;
              return {
                rec_id: r.id as string,
                canonical_id: r.canonical_id as string,
                name: (cn?.name as string) || "",
                location: (cn?.location as string) || "",
                category: (cn?.primary_category as string) || null,
                user_filed: (cn?.class_source as string) === "user",
                tags: Array.isArray(cn?.ai_tags) ? (cn?.ai_tags as string[]) : [],
                origin: r.query_id ? (originText[r.query_id as string] || "") : "",
                emoji: (cn?.image_emoji as string) || "📌",
                note: (r.note as string) || "",
                rating: (r.rating as number) || 0,
              };
            });
          }
        }
      }
    } catch (_) { /* library enrichment is best-effort */ }
  }

  // 4 ── ONE batch call: category + relevance-to-the-question, for ALL items.
  // Vectors did the recall; the LLM does the precision. The question text is
  // passed as context so bare names classify correctly (a candidate answer to
  // a pizza question is dining, not "culture").
  type Pending = { idx: number; kind: "resp" | "lib"; text: string };
  const pending: Pending[] = [];
  responses.forEach((r, i) => {
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
          model: "gpt-4o-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Someone asked their trusted circle: \"" + String(q.text).slice(0, 200) + "\". " +
                "You are given candidate items for the answer sheet. For EACH item return: " +
                "category — one of [" + CATEGORIES.map((c) => '"' + c + '"').join(",") + "] " +
                "describing what the item IS (a restaurant is dining even on a trip; a hotel is travel; " +
                "a sight/museum is culture); and relevant — true only if the item plausibly answers " +
                "THIS question (for a pizza question, a bar or a sabich place is NOT relevant; " +
                "for a broad trip question, hotels, food and sights are ALL relevant). " +
                "Some items note the question they ORIGINALLY answered — strong evidence of what " +
                "the item is: an item that answered a bistro question is a bistro, not a pizza place. " +
                "If the current question asks for something SPECIFIC (a dish, a cuisine, a profession) " +
                "and you cannot tell what an item is from its evidence, mark it NOT relevant — " +
                "a specific question deserves a precise sheet. " +
                "Items may be Hebrew or English. " +
                'Respond JSON only: {"results": [{"category": "...", "relevant": true|false}, ...same order]}',
            },
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
            if (p.kind === "resp") {
              respCats[p.idx] = cat;
            } else {
              // human corrections are sacred; AI filings yield to the better-informed judge
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

  // drop library pulls the judge marked irrelevant (responses are NEVER dropped —
  // a person chose to answer with them)
  const hiddenCount = library.filter((_, i) => libRelevant[i] === false).length;
  library = library.filter((_, i) => libRelevant[i] !== false);

  // 5 ── assemble + corroboration-merge (match by normalized name)
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

  responses.forEach((r, i) => {
    const keyName = norm(r.rec_name);
    if (!keyName) return;
    const who = r.is_anonymous ? "Someone (anonymous)" : (memberNames[r.member_id] || "Someone");
    const existing = byName[keyName];
    if (existing) {
      if (!existing.recommenders.includes(who)) existing.recommenders.push(who);
      if (r.rec_note) existing.notes.push({ by: who, note: r.rec_note });
      if (!existing.member_id) existing.member_id = r.member_id || null;
    } else {
      byName[keyName] = {
        name: r.rec_name, location: r.rec_location || "", category: respCats[i] || "other",
        emoji: r.rec_emoji || "📌",
        from_you: false, recommenders: [who],
        notes: r.rec_note ? [{ by: who, note: r.rec_note }] : [],
        rating: 0, rec_id: null, member_id: r.member_id || null,
      };
    }
  });

  const items = Object.values(byName);
  return json({
    engine: "sheet-v3",
    judge_error: judgeError,
    query_text: q.text,
    counts: {
      total: items.length,
      from_circle: items.filter((x) => x.recommenders.length > 0 && !x.from_you).length,
      from_you: items.filter((x) => x.from_you && x.recommenders.length === 0).length,
      corroborated: items.filter((x) => x.from_you && x.recommenders.length > 0).length,
      hidden: hiddenCount,
    },
    items,
  });
});
