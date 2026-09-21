// ============================================================================
// POST /functions/v1/receive-response
// Public (token-authenticated). Called when a member submits the response form.
// No JWT required — the single-use response_token is the credential.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";
import { enrichOne, embed, enrichmentPatch } from "../_shared/enrich_core.ts";

interface Item {
  rec_name: string;
  rec_note?: string;
  rec_location?: string;
}

interface Body {
  token: string;
  // One answer, as respond.html has always sent it...
  rec_name?: string;
  rec_note?: string;
  rec_location?: string;
  // ...or several at once (v0.96.0), which is what "answer from my library"
  // sends: each becomes its own answer row from the same person, so the
  // asker's sheet groups them exactly like answers typed one at a time.
  items?: Item[];
  shared_to_network?: boolean;
}

const MAX_ITEMS = 20;

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
  // One shape from here down. The single-answer form is a list of one.
  const items: Item[] = (Array.isArray(body.items) && body.items.length
    ? body.items
    : [{ rec_name: body.rec_name ?? "", rec_note: body.rec_note, rec_location: body.rec_location }])
    .filter((it) => (it?.rec_name ?? "").trim())
    .slice(0, MAX_ITEMS);
  if (!body.token || !items.length) return err("token and rec_name required");

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

  // 4-6. EACH ITEM OF THE ANSWER (v0.96.0)
  //
  // One answer used to be one thing. "Answer from my library" sends several at
  // once, and each becomes its OWN answer row from the same person - which is
  // what the asker's sheet already groups and counts. The first item takes the
  // row this token belongs to; the rest are inserted beside it, each with its
  // own (already spent) token, because response_token is unique and NOT NULL.
  //
  // Nothing below the first write is worth doing if that write failed, so it
  // returns. A LATER item failing is logged and the rest are kept: losing four
  // good answers because the fifth clashed would be worse than the gap.
  const stored: { canonicalId: string | null; name: string }[] = [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].rec_name.trim();
    const note = items[i].rec_note?.trim() ?? null;
    const loc = items[i].rec_location?.trim() ?? null;

    // Canonical dedup - try to match an existing canonical, else create.
    let canonicalId: string | null = null;
    const { data: matchId } = await admin.rpc("match_canonical", {
      p_name: name,
      p_location: loc,
    });
    if (matchId) {
      canonicalId = matchId as string;
    } else {
      const { data: newCan } = await admin.from("canonicals").insert({
        type: "place", name: name,
        location: loc,
        image_emoji: guessEmoji(name, loc ?? undefined), created_by: query?.sent_by ?? null,
      }).select("id").single();
      canonicalId = newCan?.id ?? null;
    }

    const answer = {
      rec_name: name,
      rec_note: note,
      rec_location: loc,
      rec_emoji: guessEmoji(name, loc ?? undefined),
      canonical_id: canonicalId,
      responded_at: new Date().toISOString(),
      token_used: true,
      send_status: "responded",
      // The opt-OUT from the answer dialog. Default TRUE: sharing is automatic
      // and the toggle turns it off, matching the save card's promise.
      shared_to_network: body.shared_to_network !== false,
    };

    if (i === 0) {
      // THE ANSWER ITSELF. Unchecked until v0.73.0, and the function returned
      // success regardless - so a failure here left the reply nowhere, notified
      // the asker from the REQUEST BODY for an answer that was never stored,
      // and showed the answerer the thanks screen. The answerer is a person
      // with no account, no error and no way to tell anyone.
      const { error: respErr } = await admin.from("query_responses")
        .update(answer).eq("response_token", body.token);
      if (respErr) {
        console.error("response_write_failed", body.token, respErr.message);
        // token_used is set BY the statement that just failed, so the token is
        // still unspent and this is genuinely retryable. Say so, and let
        // respond.html put the form back rather than thanking her for nothing.
        return err("response_not_saved: " + respErr.message, 500);
      }
    } else {
      const { error: insErr } = await admin.from("query_responses").insert({
        query_id: qr.query_id,
        member_id: qr.member_id,
        degree: qr.degree ?? 1,
        is_anonymous: qr.is_anonymous ?? false,
        response_token: crypto.randomUUID(),
        token_expires_at: qr.token_expires_at,
        ...answer,
      });
      if (insErr) {
        console.error("extra_answer_write_failed", body.token, name, insErr.message);
        continue;
      }
    }
    stored.push({ canonicalId, name });
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

  // ── ENRICH EACH ANSWER (v0.59.0) ─────────────────────────────────────────
  // WHY THIS EXISTS: an answer became a canonical here and was NEVER enriched.
  // No kind, no tags, no search document. Consequences, both real: the
  // shared-interest sweep skips it - `if (!kind) continue` - and it is
  // invisible to library search until someone explicitly saves it.
  //
  // ORDER MATTERS: the answer rows are ALREADY WRITTEN above. The responder is
  // a person mid-flow, and losing their reply because a web lookup timed out
  // would be far worse than an unenriched canonical. Best-effort, and it cannot
  // fail the response.
  //
  // The question text goes in, so "asked: good resort for a family week in
  // France" lands in the search document - the question is evidence, the circle
  // is not (product law, v0.37.0).
  const key = Deno.env.get("OPENAI_API_KEY");
  for (const it of stored) {
    if (!it.canonicalId || !key) continue;
    try {
      const { data: existing } = await admin
        .from("canonicals").select("kind, search_doc").eq("id", it.canonicalId).single();
      // Only enrich what needs it: a matched canonical is usually already done.
      if (!existing?.kind || !existing?.search_doc) {
        const src = items.find((x) => x.rec_name.trim() === it.name);
        const e = await enrichOne(key, {
          name: it.name,
          note: src?.rec_note?.trim() ?? "",
          location: src?.rec_location?.trim() ?? "",
          query_text: query?.text ?? "",
        });
        const vec = await embed(key, e.search_doc);
        const { error: upErr } = await admin.from("canonicals")
          .update(enrichmentPatch(e, vec)).eq("id", it.canonicalId);
        if (upErr) console.error("answer enrichment write failed:", upErr.message);
      }
    } catch (e) {
      console.error("answer enrichment failed (response already saved):", String(e).slice(0, 200));
    }
  }

  // ONE notification, however many things came with the answer.
  if (query) {
    const who = member?.name ?? "Someone";
    const { error: notifErr } = await admin.from("notifications").insert({
      user_id: query.sent_by, type: "query_response",
      title: stored.length > 1 ? "New recommendations" : "New recommendation",
      body: stored.length > 1
        ? `${who} answered with ${stored.length} recommendations`
        : `${who} recommended ${stored[0].name}`,
      query_id: query.id,
      actor_name: member?.name ?? null,
    });
    if (notifErr) console.error("response_notify_failed", query.id, notifErr.message);
  }

  return json({
    success: true,
    stored: stored.length,
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
