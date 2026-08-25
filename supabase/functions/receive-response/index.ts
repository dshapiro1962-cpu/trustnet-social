// ============================================================================
// POST /functions/v1/receive-response
// Public (token-authenticated). Called when a member submits the response form.
// No JWT required — the single-use response_token is the credential.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";
import { enrichOne, embed, enrichmentPatch } from "../_shared/enrich_core.ts";

interface Body {
  token: string;
  rec_name: string;
  rec_note?: string;
  rec_location?: string;
  shared_to_network?: boolean;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("invalid_json");
  }
  if (!body.token || !body.rec_name?.trim()) return err("token and rec_name required");

  const admin = adminClient();

  // 1. Look up the response row by token
  const { data: qr, error: qrErr } = await admin
    .from("query_responses").select("*").eq("response_token", body.token).single();
  if (qrErr || !qr) return err("invalid_token", 404);

  // 2. Validate token: not used, not expired
  if (qr.token_used) return err("token_already_used", 410);
  if (new Date(qr.token_expires_at) < new Date()) return err("token_expired", 410);

  // 3. Resolve the query + member for context
  const { data: query } = await admin
    .from("queries").select("*").eq("id", qr.query_id).single();
  const { data: member } = qr.member_id
    ? await admin.from("members").select("*").eq("id", qr.member_id).single()
    : { data: null };

  // 4. Canonical dedup — try to match an existing canonical, else create
  let canonicalId: string | null = null;
  const { data: matchId } = await admin.rpc("match_canonical", {
    p_name: body.rec_name.trim(),
    p_location: body.rec_location?.trim() ?? null,
  });
  if (matchId) {
    canonicalId = matchId as string;
  } else {
    const emoji = guessEmoji(body.rec_name, body.rec_location);
    const { data: newCan } = await admin.from("canonicals").insert({
      type: "place", name: body.rec_name.trim(),
      location: body.rec_location?.trim() ?? null,
      image_emoji: emoji, created_by: query?.sent_by ?? null,
    }).select("id").single();
    canonicalId = newCan?.id ?? null;
  }

  // 5. Update the response row
  //
  // THE ANSWER ITSELF. Unchecked until v0.73.0, and the function returned
  // success regardless - so a failure here left the reply nowhere, notified the
  // asker from the REQUEST BODY for an answer that was never stored, and showed
  // the answerer the thanks screen. The answerer is a person with no account,
  // no error and no way to tell anyone. Eighth-and-ninth instance of announcing
  // success over a rejected write, in the one place the user is a stranger.
  //
  // Nothing below this line is worth doing if the answer was not stored, so
  // this returns rather than continuing to enrich and notify.
  const { error: respErr } = await admin.from("query_responses").update({
    rec_name: body.rec_name.trim(),
    rec_note: body.rec_note?.trim() ?? null,
    rec_location: body.rec_location?.trim() ?? null,
    rec_emoji: guessEmoji(body.rec_name, body.rec_location),
    canonical_id: canonicalId,
    responded_at: new Date().toISOString(),
    token_used: true,
    send_status: "responded",
    // The opt-OUT from the answer dialog. Default TRUE: sharing is automatic and
    // the toggle turns it off, matching the save card's promise. The column
    // existed from 0026 with nothing writing it — a toggle with a home and no
    // value, which is the same dead-flag pattern as `verified` and `kind` before
    // they were wired up.
    shared_to_network: body.shared_to_network !== false,
  }).eq("response_token", body.token);
  if (respErr) {
    console.error("response_write_failed", body.token, respErr.message);
    // token_used is set BY the statement that just failed, so the token is
    // still unspent and this is genuinely retryable. Say so, and let
    // respond.html put the form back rather than thanking her for nothing.
    return err("response_not_saved: " + respErr.message, 500);
  }

  // THE ANSWERER'S OWN NOTIFICATION IS NOW DONE (0046). Nothing marked it
  // before, so it kept a live "Answer" button for ever, and pressing it
  // produced "This link was already used" - measured in dan's inbox 25 Aug.
  // Best-effort: the answer is stored and must stay stored, so a failure here
  // cannot fail the response. Loud, though: the button stays wrong otherwise.
  const { error: nhErr } = await admin.from("notifications")
    .update({ handled_at: new Date().toISOString() })
    .eq("response_token", body.token);
  if (nhErr) console.error("notification_handled_write_failed", body.token, nhErr.message);

  // ── ENRICH THE ANSWER (v0.59.0) ───────────────────────────────────────────
  // WHY THIS EXISTS: an answer became a canonical here and was NEVER enriched.
  // No kind, no tags, no search document. Consequences, both real:
  //   * the shared-interest sweep skips it — `if (!kind) continue` — so 61 of
  //     dan's 114 contributions could never match anyone's interest. Answers
  //     are the richest content in Trustnet and were the one shape that could
  //     not spread.
  //   * it is invisible to library search until someone explicitly saves it.
  //
  // ORDER MATTERS: the answer row is ALREADY WRITTEN above. The responder is a
  // person with no app, mid-flow, and losing their reply because a web lookup
  // timed out would be far worse than an unenriched canonical. Enrichment is
  // best-effort and cannot fail the response.
  //
  // The question text goes in, so "asked: good resort for a family week in
  // France" lands in the search document — the question is evidence, the circle
  // is not (product law, v0.37.0).
  if (canonicalId) {
    try {
      const key = Deno.env.get("OPENAI_API_KEY");
      const { data: existing } = await admin
        .from("canonicals").select("kind, search_doc").eq("id", canonicalId).single();
      // Only enrich what needs it: a matched canonical is usually already done.
      if (key && (!existing?.kind || !existing?.search_doc)) {
        const e = await enrichOne(key, {
          name: body.rec_name.trim(),
          note: body.rec_note?.trim() ?? "",
          location: body.rec_location?.trim() ?? "",
          query_text: query?.text ?? "",
        });
        const vec = await embed(key, e.search_doc);
        const { error: upErr } = await admin.from("canonicals")
          .update(enrichmentPatch(e, vec)).eq("id", canonicalId);
        if (upErr) console.error("answer enrichment write failed:", upErr.message);
      }
    } catch (e) {
      // Logged, never thrown: the answer is already safe and must stay so.
      console.error("answer enrichment failed (response already saved):", String(e).slice(0, 200));
    }
  }

  // 6. Notify the querying user (in-app) — real-time subscription also fires
  if (query) {
    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: query.sent_by, type: "query_response",
      title: "New recommendation",
      body: `${member?.name ?? "Someone"} recommended ${body.rec_name.trim()}`,
      query_id: query.id,
      actor_name: member?.name ?? null,
    });
    // The answer IS saved by now, so a failed notification must not fail the
    // response - but it must not be invisible either: the asker simply never
    // hears that an answer arrived.
    if (notifErr) console.error("response_notify_failed", query.id, notifErr.message);
  }

  // TELL THE PAGE WHO THE ANSWERER IS — authoritatively.
  // respond.html decided whether to show the "join Trustnet" invitation by
  // asking `readTnSession()`: IS THERE A SESSION IN THIS BROWSER? That is the
  // wrong question. dan added dshari08@hotmail.com as an answerer, opened the
  // link on his own machine, and the page found HIS session — so it concluded
  // the answerer already had Trustnet, SUPPRESSED THE INVITATION, and its
  // "Back to Trustnet" button landed on dan's account.
  // It is not only a test artefact: anyone answering on a shared or family
  // computer is denied the invitation for the same reason.
  // The member row we already loaded holds the truth. Only a boolean leaves
  // here — never the account id.
  return json({
    success: true,
    answerer_on_trustnet: !!member?.linked_user_id,
  });
});

function guessEmoji(name: string, location?: string): string {
  const s = (name + " " + (location ?? "")).toLowerCase();
  const map: [string, string][] = [
    ["restaurant", "🍽️"], ["cafe", "☕"], ["bar", "🍷"], ["wine", "🍷"],
    ["hotel", "🏨"], ["book", "📖"], ["film", "🎬"], ["movie", "🎬"],
    ["museum", "🏛️"], ["doctor", "👩‍⚕️"], ["dr ", "👩‍⚕️"], ["dr.", "👩‍⚕️"],
    ["dentist", "🦷"], ["gym", "🏋️"], ["plumber", "🔧"], ["clinic", "🏥"],
  ];
  for (const [k, e] of map) if (s.includes(k)) return e;
  return "📌";
}
