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
import { interestsForKind } from "../_shared/enrich_core.ts";

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
  const started = new Date().toISOString();

  // ── 1. what has appeared since last time ─────────────────────────────────
  const { data: state } = await admin
    .from("sweep_state").select("last_at").eq("name", "suggestions").single();
  const since = state?.last_at ?? new Date(Date.now() - 86400000).toISOString();

  // Contributions = saved items AND answers. dan: "include query and answer."
  const { data: recs } = await admin
    .from("recommendations")
    .select("id, owner_id, canonical_id, note, shared_to_network, created_at, person_id")
    .gt("created_at", since)
    .eq("shared_to_network", true)
    .limit(500);

  const { data: answers } = await admin
    .from("query_responses")
    .select("id, member_id, canonical_id, rec_name, rec_note, shared_to_network, responded_at")
    .gt("responded_at", since)
    .eq("shared_to_network", true)
    .not("canonical_id", "is", null)
    .limit(500);

  type Contribution = {
    canonical_id: string; contributor_user: string | null;
    contributor_member: string | null; via: "answer" | "save"; note: string;
  };
  const contributions: Contribution[] = [];
  for (const r of recs ?? []) {
    contributions.push({ canonical_id: r.canonical_id, contributor_user: r.owner_id,
      contributor_member: null, via: "save", note: r.note ?? "" });
  }
  for (const a of answers ?? []) {
    contributions.push({ canonical_id: a.canonical_id, contributor_user: null,
      contributor_member: a.member_id, via: "answer", note: a.rec_note ?? a.rec_name ?? "" });
  }
  if (!contributions.length) {
    await admin.from("sweep_state").update({ last_at: started }).eq("name", "suggestions");
    return json({ engine: ENGINE, scanned: 0, created: 0 });
  }

  // ── 2. what ARE these things? read the stored kind, never re-derive it ────
  const canIds = [...new Set(contributions.map((c) => c.canonical_id))];
  const { data: cans } = await admin
    .from("canonicals").select("id, name, kind").in("id", canIds);
  const kindOf: Record<string, string> = {};
  const nameOf: Record<string, string> = {};
  for (const c of cans ?? []) { kindOf[c.id] = c.kind ?? ""; nameOf[c.id] = c.name ?? ""; }

  // ── 3. who is interested? confirmed interests only ───────────────────────
  const { data: interests } = await admin
    .from("circle_interests")
    .select("circle_id, owner_id, interest, terms, is_custom")
    .eq("source", "confirmed");
  if (!interests?.length) {
    await admin.from("sweep_state").update({ last_at: started }).eq("name", "suggestions");
    return json({ engine: ENGINE, scanned: contributions.length, created: 0, reason: "no_confirmed_interests" });
  }

  // Membership: which of MY circles is a given person in?
  const circleIds = [...new Set(interests.map((i) => i.circle_id))];
  const { data: members } = await admin
    .from("members")
    .select("id, circle_id, owner_id, person_id, linked_user_id")
    .in("circle_id", circleIds);

  let created = 0;
  // WHY THIS DETAIL EXISTS: the first version reported only {scanned, created}
  // and SWALLOWED insert errors (`if (!error) created++`). When dan's Jackson
  // Hole match produced created:0 with every gate visibly passing, there was
  // NOTHING to look at — a failure and a non-match were indistinguishable. That
  // is the same conflation that made a crashed identity lookup read as "not a
  // user". Every drop-out is now counted and every error is returned.
  const why = { no_kind: 0, not_a_member: 0, own_item: 0, no_interest_match: 0,
                already_in_library: 0, insert_failed: 0 };
  const errors: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const c of contributions) {
    const kind = kindOf[c.canonical_id];
    if (!kind) { why.no_kind++; continue; }       // no kind -> never matches. Silence beats a guess.
    const builtIn = interestsForKind(kind);

    for (const ci of interests) {
      // Is the contributor in THIS circle?
      const m = (members ?? []).find((x) =>
        x.circle_id === ci.circle_id &&
        ((c.contributor_user && x.linked_user_id === c.contributor_user) ||
         (c.contributor_member && x.id === c.contributor_member)));
      if (!m) { why.not_a_member++; continue; }
      if (ci.owner_id === c.contributor_user) { why.own_item++; continue; }   // never suggest your own item back

      const hit = ci.is_custom
        ? customMatches(kind, ci.terms ?? [])
        : builtIn.includes(ci.interest);
      if (!hit) { why.no_interest_match++; continue; }

      rows.push({
        user_id: ci.owner_id, canonical_id: c.canonical_id,
        from_person_id: m.person_id ?? null, from_user_id: c.contributor_user,
        via: c.via, source_note: String(c.note).slice(0, 300),
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
    const { data: has } = await admin.from("recommendations")
      .select("id").eq("owner_id", r.user_id).eq("canonical_id", r.canonical_id).limit(1);
    if (has?.length) { why.already_in_library++; continue; }
    // onConflict does nothing: a dismissal must STAY dismissed.
    const { error } = await admin.from("suggestions").insert(r);
    if (error) {
      // NEVER silent. An insert that fails must be visible, or a broken feature
      // looks exactly like a feature with nothing to do.
      why.insert_failed++;
      if (errors.length < 5) errors.push(String(error.message ?? error).slice(0, 200));
    } else { created++; }
  }

  await admin.from("sweep_state").update({ last_at: started }).eq("name", "suggestions");
  return json({ engine: ENGINE, scanned: contributions.length, created,
                candidates: Object.keys(merged).length, why, errors });
});
