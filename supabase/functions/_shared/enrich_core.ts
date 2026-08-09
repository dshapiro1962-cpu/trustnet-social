// ============================================================================
// _shared/enrich_core.ts — THE single source of truth for enrichment.
// Extracted VERBATIM from librarian/index.ts on 4 Aug 2026, not copied:
// librarian imports from here, and so do extract-chat-recs and
// whatsapp-webhook. Before this file existed there were FOUR drifting
// versions of "what text do we embed" (librarian, classify-rec, the webhook,
// and nothing at all for chat import) — which is exactly how items became
// invisible to search while looking perfectly classified.
// Change the search document HERE and every path changes together.
// ============================================================================

export const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];
export const EMB_MODEL = "text-embedding-3-large";

export interface Enriched {
  name: string; location: string; category: string; tags: string[];
  search_doc: string; resolved: boolean; kind: string;
}

export function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// A recommendation name is an ENTITY, never a sentence (the Avoriaz rule).
export function looksLikeSentence(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).length;
  if (words >= 7) return true;
  if (/[.!?]$/.test(t) && words >= 4) return true;
  if (/^(yes|no|yeah|sure|definitely|absolutely|כן|לא|בהחלט)\b/i.test(t)) return true;
  return false;
}

// The search document: everything a future question might reasonably use.
// ═══ PRODUCT LAW (dan, 4 Aug 2026) ═══════════════════════════════════════════
// Circles and categories are PROVENANCE, not EVIDENCE. The card may show
// "from ski circle" — the client reads rec.circleId for that — but retrieval
// must be blind to it: a Milano hotel discussed in the ski circle is a Milano
// hotel. Only the item itself, the question asked, and the answers given are
// searchable. This deliberately reverses 0014's "circle: <name>" design, which
// put a dermatologist on the "ski" results screen for being filed in ski.
// Guarded: a doc containing "circle:" is a test failure (librarian-sim,
// enrichment-sim).
export function buildSearchDoc(e: {
  name: string; location: string; kind: string;
  tags: string[]; note: string; query_text: string;
}): string {
  return [
    e.name,
    e.kind,
    e.location,
    (e.tags || []).join(" "),
    e.note,
    e.query_text ? "asked: " + e.query_text : "",
  ].filter(Boolean).join(" · ").slice(0, 2000);
}

// ═══ WEB GROUNDING (v0.42.0) ════════════════════════════════════════════════
// WHY THIS EXISTS: the librarian enriched the Hebrew food writer
// "לימור לניאדו תירוש" as kind = "מתכון לקארי hair removal machine". It had
// read the question correctly (מתכון = recipe) and then invented an English
// half from nothing. Not randomness — temperature is 0, so it was confident
// and repeatable. The cause was structural: the prompt DEMANDED a kind and
// offered no way to decline, so an unrecognised name had to be filled with
// something.
//
// The old order was enrich-THEN-verify: the model guessed, and resolvePlace
// (Google Places) got one chance to correct it. Places only indexes BUSINESSES
// WITH LOCATIONS, so an author, a product or a writer was never checkable and
// its guess stood. This reverses the order — evidence FIRST, then write.
//
// Uses gpt-4o-mini-search-preview: same OPENAI_API_KEY, no new vendor, no new
// secret. Kept as a SEPARATE call from aiEnrich so the enrichment call keeps
// temperature:0 and response_format:json_object, which the search-preview
// models restrict.
// ═══ THE INTEREST VOCABULARY (v0.48.0) ══════════════════════════════════════
// Shared-interest suggestions need ONE comparable value on both sides: what X's
// item IS, and what my circle is ABOUT. The enricher's `kind` is precise —
// "novel", "children's book", "ski resort" — but too free-form to compare
// directly. This maps it onto a small fixed list.
//
// WHY A CONTROLLED LIST AND NOT SEMANTIC SIMILARITY:
// every trust decision in this product must be explainable in one sentence.
// "Rina answered this, she's in your reading circle, and it's a book" is a
// sentence a user can check. "0.83 similarity" is not, and the entire point of
// Trustnet is that you can see WHY something reached you.
//
// Unmapped kinds return [] and therefore NEVER match. Silence beats a wrong
// guess — the enricher once confidently produced "hair removal machine".
export const INTERESTS = [
  "book", "restaurant", "bar", "cafe", "hotel", "destination", "ski",
  "doctor", "tradesperson", "shop", "product", "service",
] as const;

// Matched as WHOLE WORDS against the kind, longest phrase first. Hebrew terms
// sit alongside English because the enricher is instructed to emit both.
const KIND_MAP: Array<[string[], string[]]> = [
  [["novel","book","novella","memoir","biography","textbook","cookbook",
    "ספר","רומן"],                                   ["book"]],
  [["ski resort","ski area","ski touring boot","ski boot","ski","skis",
    "מסלול סקי","סקי"],                              ["ski"]],
  [["restaurant","bistro","eatery","diner","steakhouse","pizzeria",
    "מסעדה","פיצריה"],                               ["restaurant"]],
  [["bar","pub","cocktail bar","wine bar","בר"],      ["bar"]],
  [["cafe","coffee shop","coffeehouse","bakery","patisserie",
    "בית קפה","מאפיה"],                              ["cafe"]],
  [["hotel","guesthouse","hostel","lodge","bed and breakfast",
    "מלון","אכסניה"],                                ["hotel"]],
  [["island","city","town","region","beach","national park","landmark",
    "monument","museum","gallery","אי","עיר","מוזיאון"], ["destination"]],
  [["doctor","dermatologist","physician","dentist","clinic","surgeon",
    "רופא","רופאה","מרפאה"],                         ["doctor"]],
  [["plumber","electrician","handyman","technician","contractor","painter",
    "framer","air conditioning","שיפוצניק","חשמלאי","טכנאי","מסגר"],
                                                     ["tradesperson"]],
  [["butcher","grocer","market","store","shop","boutique",
    "חנות","קצביה","סופר"],                          ["shop"]],
  [["grill","gas grill","appliance","equipment","gear","device","machine",
    "מכשיר","ציוד"],                                 ["product"]],
  [["babysitter","nanny","cleaner","tutor","dog sitter","accountant",
    "lawyer","בייביסיטר","מטפלת","מנקה"],            ["service"]],
];

// A ski resort is BOTH a place you travel to and a ski thing. Returning both
// lets one item match either a travel circle or a ski circle — a circle may
// hold several interests, and a match on any one counts.
const ALSO: Record<string, string[]> = { ski: ["destination"] };

export function interestsForKind(kind: string): string[] {
  const k = " " + String(kind || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  if (k.trim() === "") return [];
  const hits = new Set<string>();
  for (const [terms, out] of KIND_MAP) {
    for (const t of terms) {
      if (k.indexOf(" " + t + " ") >= 0) {           // WHOLE word, never substring:
        out.forEach((o) => hits.add(o));             // "bar" must not match "barber",
        break;                                       // "ski" must not match "skin".
      }
    }
  }
  for (const h of [...hits]) (ALSO[h] || []).forEach((a) => hits.add(a));
  return [...hits];
}

export async function webGround(key: string, name: string, hint: string): Promise<string> {
  if (!key || !name) return "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROUNDING_MODEL") ?? "gpt-4o-mini-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content:
          "Search the web and say what this is, in at most two sentences: \"" + name + "\"" +
          (hint ? " (context: " + hint.slice(0, 120) + ")" : "") + ". " +
          "State only what the search results support: what kind of thing or person it is, " +
          "and where, if the results say. Do not speculate and do not fill gaps. " +
          "If the search results do not identify it, reply with exactly: NOT FOUND" }],
      }),
    });
    if (!r.ok) return "";
    const c = await r.json();
    const txt = String(c.choices?.[0]?.message?.content ?? "").trim();
    if (!txt || /^NOT FOUND/i.test(txt)) return "";
    return txt.slice(0, 600);
  } catch (_) { return ""; }
}

export async function aiEnrich(key: string, input: {
  name: string; note: string; location: string; query_text: string; evidence?: string;
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
            "Derive tags ONLY from the item itself, its note, the question asked and the answers "+
            "given. NEVER from which circle or folder it was saved in \u2014 a restaurant discussed "+
            "in a ski circle is just a restaurant (circles are the user's filing, not content). "+
            "EVIDENCE, when present, is from a live web search and OUTRANKS your own "+
            "recollection: use it for kind, category and location. When there is NO "+
            "evidence and you do not actually recognise the item, return kind:\"\" and "+
            "only tags you can justify from the note and the question. An EMPTY field is "+
            "correct; a plausible guess is not. Never blend a guess with real context — "+
            "\"מתכון לקארי hair removal machine\" is the failure this rule exists to stop. "+
            "Words implied by the CONTENT do belong: an item praised for children must carry "+
            "\"family\" and \"kids\". Include both Hebrew and English forms of key words when the "+
            "content is Hebrew. Tags are what makes it findable later." },
          { role: "user", content: JSON.stringify({
              name: input.name, note: input.note, location: input.location,
              question: input.query_text,
              EVIDENCE: input.evidence || "(no web evidence found for this item)",
            }) },
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

export async function resolvePlace(name: string, hint: string): Promise<
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

export async function embed(key: string, text: string): Promise<number[] | null> {
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

export async function enrichOne(key: string, input: {
  name: string; note: string; location: string; query_text: string;
}): Promise<Enriched> {
  // EVIDENCE BEFORE WRITING. The old order let the model guess and hoped a
  // later Places lookup would correct it; Places cannot see anything that is
  // not a business with an address.
  const evidence = key ? await webGround(key, input.name, [input.query_text, input.note].filter(Boolean).join(" ")) : "";
  const ai = key ? await aiEnrich(key, { ...input, evidence }) : null;
  let name = ai?.name || input.name;
  // Never let a sentence become an entity; fall back to the question's subject
  // when the answer text is testimony rather than a name.
  if (looksLikeSentence(name)) name = (ai?.name && !looksLikeSentence(ai.name)) ? ai.name : input.name;

  let location = ai?.location || input.location || "";
  let category = ai?.category || "other";
  const kind = ai?.kind || "";
  const tags = ai?.tags || [];
  // `resolved` = a real-world source confirmed this entity exists, by EITHER
  // route. Previously computed, returned, and then thrown away — nothing
  // persisted it, so a Google-confirmed restaurant and an invented occupation
  // were indistinguishable downstream. v0.42.0 writes it to canonicals.verified.
  let resolved = !!evidence;

  const place = await resolvePlace(name, [kind, location].filter(Boolean).join(" "));
  if (place) {
    resolved = true;
    name = place.name || name;
    location = place.location || location;
    if (place.category) category = place.category;
  }

  const search_doc = buildSearchDoc({
    name, location, kind, tags,
    note: input.note || "", query_text: input.query_text || "",
  });
  return { name, location, category, tags, search_doc, resolved, kind };
}

