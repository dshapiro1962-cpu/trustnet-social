// ============================================================================
// POST /functions/v1/suggest-sweep                    engine: sweep-v1
//
// Finds things people in your circles have contributed since the last run, and
// queues the ones that match what your circles are about.
//
// WHY A SWEEP AND NOT A TRIGGER (dan's call, and the reasoning matters):
// a database trigger runs INSIDE the other person's save. If this feature
// faults, RINA CANNOT ANSWER QUESTIONS — a failure in a nice-to-have breaking
// the core loop. A per-save call from receive-response would miss the other
// write paths (chat-import, whatsapp-webhook, manual save), which is exactly
// how save paths silently skipped enrichment twice this week. A sweep looks at
// the DATA rather than the code paths, so it cannot miss one, it logs what it
// did, and a bad rule can be fixed and re-run.
// Runs every few minutes: not instant, but nobody is worse off seeing a book
// suggestion at 15:00 instead of 14:32.
//
// THE TWO GATES:
//   1. the contributor has not opted out of sharing THIS item
//   2. the item's kind matches a CONFIRMED interest of a circle they are in
//
// Deliberately absent: which circle THEY filed it in. Circles are provenance,
// not evidence — dan's product law. X calling his circle "good read" tells us
// nothing; the item's own kind decides what it is.
//
// Auth: service role (scheduled). Requires no OpenAI call — it reads the kind
// the librarian already stored.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";
import { interestsForKind, norm } from "../_shared/enrich_core.ts";

const ENGINE = "sweep-v1";

// Whole-word, exactly like the built-in vocabulary. Substring matching is what
// made "skin" match "ski" for a week.
function customMatches(kind: string, terms: string[]): boolean {
  const k = " " + String(kind || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  if (k.trim() === "") return false;
  return (terms || []).some((t) => k.indexOf(" " + String(t).toLowerCase().trim() + " ") >= 0);
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const admin = adminClient();
  // DEBUG: pass { debug_name: "Jackson" } to have the sweep report exactly what
  // it loaded and decided for that one item. Added after four wrong theories
  // about why a visibly-matching item produced nothing: reasoning about what
  // the code SHOULD do is not the same as making it show what it HAS.
  let dbgName = "";
  let dryRun = false;
  let sinceOverride = "";
  try {
    const b = await req.json();
    dbgName = String(b?.debug_name ?? "");
    // DRY RUN: look at everything, decide everything, WRITE NOTHING and leave
    // the watermark alone. Diagnosing this feature was impossible because every
    // observation changed the thing being observed.
    dryRun = b?.dry_run === true;
    sinceOverride = String(b?.since ?? "");
  } catch (_) { /* no body */ }
  const dbg: Record<string, unknown> = {};

  // ── 1. what has appeared since last time ─────────────────────────────────
  // If THIS fails we fall back to a 1-day window rather than aborting — a
  // missing watermark row is recoverable, and the fallback is explicit.
  const { data: state, error: stateErr } = await admin
    .from("sweep_state").select("last_at").eq("name", "suggestions").single();
  if (stateErr) console.error("sweep_state read failed, using default window:", stateErr.message);
  const since = sinceOverride || state?.last_at || new Date(Date.now() - 86400000).toISOString();

  // Contributions = saved items AND answers. dan: "include query and answer."
  // EVERY QUERY'S ERROR IS CHECKED. This one silently returned null and the
  // sweep reported scanned:68 — exactly the ANSWERS count — while 46
  // recommendations, INCLUDING dan's Jackson Hole, never entered the array at
  // all. Five diagnoses examined the wrong half of the data because a failed
  // query and an empty one were indistinguishable. Fifth time this pattern has
  // appeared in this project; it is now impossible here.
  const { data: recs, error: recsErr } = await admin
    .from("recommendations")
    // NO person_id HERE. It is a column on MEMBERS, not on recommendations, and
    // it was never used from this row — from_person_id comes from `m` below.
    // Asking for a non-existent column made the whole query fail; the error was
    // discarded, so 46 recommendations silently vanished from every run while
    // the answers half sailed through. One wrong word, five rounds of guessing.
    .select("id, owner_id, canonical_id, note, shared_to_network, created_at, query_id, source_question")
    .gt("created_at", since)
    .eq("shared_to_network", true)
    .order("created_at", { ascending: true })   // oldest first: the watermark
    .limit(500);                                 // may only advance over what we SAW

  const { data: answers, error: ansErr } = await admin
    .from("query_responses")
    .select("id, member_id, canonical_id, rec_name, rec_note, shared_to_network, responded_at, query_id")
    .gt("responded_at", since)
    .eq("shared_to_network", true)
    .not("canonical_id", "is", null)
    .order("responded_at", { ascending: true })
    .limit(500);

  // A source that FAILED must abort the run, not quietly contribute nothing.
  // Advancing the watermark after a partial read would lose those rows forever.
  if (recsErr || ansErr) {
    return err("source_query_failed: " +
      [recsErr ? "recommendations: " + recsErr.message : "",
       ansErr ? "query_responses: " + ansErr.message : ""].filter(Boolean).join(" | "), 500);
  }

  type Contribution = {
    canonical_id: string; contributor_user: string | null;
    contributor_member: string | null; via: "answer" | "save"; note: string;
    at: string | null;
    // THE QUESTION TRAVELS (0047). An answer IS a reply to a question, and a
    // saved item often is too. Carrying it means the card can say what was
    // asked - which the recipient can never look up themselves, because
    // `queries` is readable only by the person who sent it.
    query_text: string;
  };
  // The question text, for every query these contributions came from. One
  // lookup, not one per row - and it runs as the service role, so it can read
  // questions the RECIPIENT never could.
  const qIdsAll = [...new Set([
    ...(recs ?? []).map((r: Record<string, unknown>) => r.query_id),
    ...(answers ?? []).map((a: Record<string, unknown>) => a.query_id),
  ].filter(Boolean))] as string[];
  const qTextById: Record<string, string> = {};
  if (qIdsAll.length) {
    const { data: qrows, error: qErr } = await admin
      .from("queries").select("id, text").in("id", qIdsAll);
    if (qErr) console.error("sweep_query_text_failed", qErr.message);
    for (const q of qrows ?? []) qTextById[q.id as string] = (q.text as string) ?? "";
  }

  const contributions: Contribution[] = [];
  for (const r of recs ?? []) {
    contributions.push({ canonical_id: r.canonical_id, contributor_user: r.owner_id,
      contributor_member: null, via: "save", note: r.note ?? "", at: r.created_at ?? null,
      // What is already on the row wins: a forwarded item keeps the question it
      // was originally answering instead of losing it at every hop.
      query_text: (r.source_question as string) || qTextById[r.query_id as string] || "" });
  }
  for (const a of answers ?? []) {
    contributions.push({ canonical_id: a.canonical_id, contributor_user: null,
      contributor_member: a.member_id, via: "answer", note: a.rec_note ?? a.rec_name ?? "",
      at: a.responded_at ?? null,
      query_text: qTextById[a.query_id as string] || "" });
  }
  if (!contributions.length) {
    // NOTHING SEEN -> DO NOT MOVE THE WATERMARK. Advancing here is what made
    // this feature undebuggable: every run consumed its own window and left no
    // trace, so five separate diagnoses chased a target the code kept resetting.
    // A run that saw nothing has nothing to record.
    return json({ engine: ENGINE, scanned: 0, created: 0, watermark_moved: false });
  }

  // ── 2. what ARE these things? read the stored kind, never re-derive it ────
  const canIds = [...new Set(contributions.map((c) => c.canonical_id))];
  const { data: cans, error: cansErr } = await admin
    .from("canonicals").select("id, name, kind, location").in("id", canIds);
  if (cansErr) return err("canonicals_query_failed: " + cansErr.message, 500);
  const kindOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  const placeOf: Record<string, string> = {};
  for (const c of cans ?? []) {
    kindOf[c.id] = c.kind ?? "";
    nameOf[c.id] = c.name ?? "";
    placeOf[c.id] = (c.location as string) ?? "";
  }

  // ── 3. who is interested? confirmed interests only ───────────────────────
  const { data: interests, error: intErr } = await admin
    .from("circle_interests")
    .select("circle_id, owner_id, interest, terms, is_custom")
    .eq("source", "confirmed");
  if (intErr) return err("interests_query_failed: " + intErr.message, 500);

  // WHERE EACH CIRCLE IS, IF ANYWHERE (0048). Until this existed the match was
  // type-only: a circle named "Italy" was, to this function, just "hotels and
  // restaurants" anywhere on earth, and a seafood place in Leros reached dan
  // through it. circles.location has been on the table all along and was
  // populated on 0 of 30 rows - the client loaded it into state and never wrote
  // or showed it. Same dead-flag shape as `verified` and `kind` before they
  // were wired up.
  const circlePlace: Record<string, string> = {};
  {
    const cids = [...new Set((interests ?? []).map((i) => i.circle_id))] as string[];
    if (cids.length) {
      const { data: crows, error: cErr } = await admin
        .from("circles").select("id, location").in("id", cids);
      if (cErr) console.error("sweep_circle_place_failed", cErr.message);
      for (const c of crows ?? []) circlePlace[c.id as string] = (c.location as string) ?? "";
    }
  }
  if (!interests?.length) {
    // NOBODY HAS CONFIRMED AN INTEREST YET, so nothing could match — but that
    // is a reason to WAIT, not to consume the window. Advancing here would
    // throw away every contribution made before the first interest is set, and
    // they would never be reconsidered. Caught by watermark-sim: the third
    // early return I had missed.
    return json({ engine: ENGINE, scanned: contributions.length, created: 0,
                  reason: "no_confirmed_interests", watermark_moved: false });
  }

  // Membership: which of MY circles is a given person in?
  const circleIds = [...new Set(interests.map((i) => i.circle_id))];
  const { data: members, error: memErr } = await admin
    .from("members")
    .select("id, circle_id, owner_id, person_id, linked_user_id")
    .in("circle_id", circleIds);

  if (memErr) return err("members_query_failed: " + memErr.message, 500);

  // THE CONTRIBUTOR'S OWN NAME, as a fallback for the card.
  // The sweep set only from_person_id, taken from the member row's person link
  // — and person_id was populated by ONE of five member producers, so for most
  // rows it is null. The card then had nothing to name and said "This arrived
  // without a sender", which dan saw on three cards at once.
  // v0.60.1 gave DIRECT sends a from_name; the sweep was left with the same
  // gap. Fixing one producer and not its twin is the exact mistake the seam
  // audit exists to stop.
  const contributorIds = [...new Set(contributions
    .map((c) => c.contributor_user).filter(Boolean))] as string[];
  const nameOfUser: Record<string, string> = {};
  if (contributorIds.length) {
    const { data: us, error: usErr } = await admin
      .from("users").select("id, name").in("id", contributorIds);
    if (usErr) return err("users_query_failed: " + usErr.message, 500);
    for (const u of us ?? []) nameOfUser[u.id] = u.name ?? "";
  }

  let created = 0;
  // WHY THIS DETAIL EXISTS: the first version reported only {scanned, created}
  // and SWALLOWED insert errors (`if (!error) created++`). When dan's Jackson
  // Hole match produced created:0 with every gate visibly passing, there was
  // NOTHING to look at — a failure and a non-match were indistinguishable. That
  // is the same conflation that made a crashed identity lookup read as "not a
  // user". Every drop-out is now counted and every error is returned.
  const why = { no_kind: 0, not_a_member: 0, own_item: 0, no_interest_match: 0,
                wrong_place: 0, already_in_library: 0, insert_failed: 0 };

  // A CIRCLE WITH A PLACE ONLY TAKES THINGS FROM THERE (0048).
  //
  // Both sides must have a place for this to apply: a circle with none accepts
  // from anywhere, as it always has, and an item with none - a book, a pair of
  // ski boots - is not excluded from a place-bound circle for lacking an
  // address it could never have.
  //
  // Containment either way, the same rule the enricher uses: "Leros" matches
  // "Leros, Greece" and vice versa; "Italy" does not match "Leros".
  const placeFits = function(circleLoc: string, itemLoc: string): boolean {
    const a = norm(circleLoc || "");
    const b = norm(itemLoc || "");
    if (!a || !b) return true;
    return b.indexOf(a) > -1 || a.indexOf(b) > -1;
  };
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const c of contributions) {
    const isDbg = dbgName && (nameOf[c.canonical_id] ?? "").toLowerCase().includes(dbgName.toLowerCase());
    if (isDbg) {
      dbg.found_contribution = true;
      dbg.canonical_id = c.canonical_id;
      dbg.name = nameOf[c.canonical_id];
      dbg.kind = kindOf[c.canonical_id];
      dbg.contributor_user = c.contributor_user;
      dbg.via = c.via;
      dbg.interests_loaded = interests.length;
      dbg.members_loaded = (members ?? []).length;
      dbg.per_interest = [];
    }
    const kind = kindOf[c.canonical_id];
    if (!kind) { why.no_kind++; if (isDbg) dbg.stopped_at = "no_kind"; continue; }
    const builtIn = interestsForKind(kind);

    for (const ci of interests) {
      // Is the contributor in THIS circle?
      const m = (members ?? []).find((x) =>
        x.circle_id === ci.circle_id &&
        ((c.contributor_user && x.linked_user_id === c.contributor_user) ||
         (c.contributor_member && x.id === c.contributor_member)));
      const hit0 = ci.is_custom ? customMatches(kind, ci.terms ?? []) : builtIn.includes(ci.interest);
      if (isDbg) {
        (dbg.per_interest as unknown[]).push({
          circle: ci.circle_id, owner: ci.owner_id, interest: ci.interest,
          member_found: !!m, is_own: ci.owner_id === c.contributor_user,
          interest_hit: hit0, built_in_gives: builtIn,
        });
      }
      if (!m) { why.not_a_member++; continue; }
      if (ci.owner_id === c.contributor_user) { why.own_item++; continue; }   // never suggest your own item back

      const hit = hit0;
      if (!hit) { why.no_interest_match++; continue; }
      // dan, 25 Aug: "You share Italy, which is about restaurants" - for a
      // seafood restaurant in Leros, Greece. True on type, absurd on place.
      if (!placeFits(circlePlace[ci.circle_id] || "", placeOf[c.canonical_id] || "")) {
        why.wrong_place++;
        if (isDbg) (dbg.per_interest as unknown[]).push({
          circle: ci.circle_id, stopped_at: "wrong_place",
          circle_is_in: circlePlace[ci.circle_id], item_is_in: placeOf[c.canonical_id] });
        continue;
      }

      rows.push({
        user_id: ci.owner_id, canonical_id: c.canonical_id,
        from_person_id: m.person_id ?? null, from_user_id: c.contributor_user,
        // Prefer the recipient's OWN name for this person; fall back to the
        // contributor's profile name; never leave the card with nothing.
        from_name: (c.contributor_user ? nameOfUser[c.contributor_user] : "") || m.name || null,
        via: c.via, source_note: String(c.note).slice(0, 300),
        query_text: String(c.query_text || "").slice(0, 300),
        matched_circles: [ci.circle_id], matched_interest: ci.interest,
      });
    }
  }

  // Merge duplicates: one suggestion per user per item, remembering EVERY
  // circle that matched (the hybrid rule — Rina may be in two circles that both
  // accept books, and that must not produce two cards).
  const merged: Record<string, Record<string, unknown>> = {};
  for (const r of rows) {
    const k = String(r.user_id) + "|" + String(r.canonical_id);
    if (!merged[k]) { merged[k] = r; continue; }
    const a = merged[k].matched_circles as string[];
    const b = r.matched_circles as string[];
    merged[k].matched_circles = [...new Set([...a, ...b])];
  }

  for (const r of Object.values(merged)) {
    // Already in their library? Then it is not a suggestion.
    // A FAILED read here must not be treated as "they already have it" — that
    // would silently drop a valid suggestion. Count it as a failure instead.
    const { data: has, error: hasErr } = await admin.from("recommendations")
      .select("id").eq("owner_id", r.user_id).eq("canonical_id", r.canonical_id).limit(1);
    if (hasErr) {
      why.insert_failed++;
      if (errors.length < 5) errors.push("library_check: " + hasErr.message.slice(0, 160));
      continue;
    }
    if (has?.length) {
      why.already_in_library++;
      if (dbgName && String(r.canonical_id) === String(dbg.canonical_id)) {
        dbg.stopped_at = "already_in_library";
        dbg.library_owner_checked = r.user_id;
      }
      continue;
    }
    if (dbgName && String(r.canonical_id) === String(dbg.canonical_id)) dbg.reached_insert = true;
    // onConflict does nothing: a dismissal must STAY dismissed.
    if (dryRun) { created++; continue; }   // would have created; writes nothing
    const { error } = await admin.from("suggestions").insert(r);
    if (error) {
      // NEVER silent. An insert that fails must be visible, or a broken feature
      // looks exactly like a feature with nothing to do.
      why.insert_failed++;
      if (errors.length < 5) errors.push(String(error.message ?? error).slice(0, 200));
    } else { created++; }
  }

  // THE WATERMARK ADVANCES ONLY OVER WHAT THIS RUN ACTUALLY PROCESSED — the
  // timestamp of the newest contribution it SAW, not "now". Two reasons:
  //   * `started` skips anything written DURING the run; those rows would be
  //     silently lost forever.
  //   * with .limit(500) and more than 500 pending, jumping to `now` discards
  //     every unprocessed row in the window.
  // If an insert failed, the watermark does not move at all, so the next run
  // retries instead of erasing the evidence.
  const seenUpTo = contributions.map((c) => c.at).filter(Boolean).sort().pop() ?? null;
  let watermarkMoved = false;
  if (seenUpTo && why.insert_failed === 0 && !dryRun) {
    // watermark_moved was set to true without asking whether the write
    // succeeded. In a function whose entire design is about being diagnosable -
    // every drop-out counted, every error returned - the one line that reported
    // its own progress was taking it on faith. A failed update here means the
    // next run reprocesses the same window, which is harmless, but a run that
    // SAYS it advanced and did not is how five diagnoses chased a moving target.
    const { error: wmErr } = await admin.from("sweep_state")
      .update({ last_at: seenUpTo }).eq("name", "suggestions");
    if (wmErr) {
      console.error("sweep_watermark_write_failed", wmErr.message);
      if (errors.length < 5) errors.push("watermark: " + wmErr.message.slice(0, 160));
    } else {
      watermarkMoved = true;
    }
  }
  return json({ engine: ENGINE, scanned: contributions.length,
                from_saves: (recs ?? []).length, from_answers: (answers ?? []).length,
                created, watermark_moved: watermarkMoved,
                watermark_now: watermarkMoved ? seenUpTo : since,
                candidates: Object.keys(merged).length, why, errors,
                dry_run: dryRun, since,
                debug: dbgName ? dbg : undefined });
});
