// ============================================================================
// /functions/v1/save-collection           engine: save-collection-v1
// Auth: caller JWT. POST { token } → copies the collection's items into the
// caller's library: same canonicals (no duplication of the thing itself),
// curator's note preserved, recommended_by = the curator (provenance!),
// circle_id = null so items land in the Needs Filing tray.
// Skips items whose canonical is already in the caller's library.
// ============================================================================
import { adminClient, userClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "save-collection-v1";

interface Body { token: string; }

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const token = (body.token || "").trim();
  if (!token) return err("token_required");

  const admin = adminClient();

  const { data: col, error: cErr } = await admin
    .from("collections").select("*").eq("token", token).single();
  if (cErr || !col) return err("collection_not_found", 404);

  const { data: curator } = await admin
    .from("users").select("name").eq("id", col.owner_id).single();
  const curatorName = curator?.name || "the curator";

  if (col.owner_id === userId) {
    return json({ engine: ENGINE, ok: true, imported: 0, skipped: 0, own: true, curator: curatorName });
  }

  const { data: rows, error: iErr } = await admin
    .from("collection_items")
    .select("recommendations(id, note, rating, canonical_id)")
    .eq("collection_id", col.id);
  if (iErr) return err("items_load_failed: " + iErr.message, 500);

  // What the caller already has (skip duplicates by canonical)
  const { data: mine } = await admin
    .from("recommendations").select("canonical_id").eq("owner_id", userId);
  const have = new Set((mine ?? []).map((m: any) => m.canonical_id));

  const today = new Date().toISOString().slice(0, 10);
  let imported = 0, skipped = 0;
  for (const r of (rows ?? []) as any[]) {
    const rec = r.recommendations;
    if (!rec?.canonical_id) continue;
    if (have.has(rec.canonical_id)) { skipped++; continue; }
    const { error: insErr } = await admin.from("recommendations").insert({
      owner_id: userId,
      canonical_id: rec.canonical_id,
      circle_id: null,                       // → Needs Filing tray
      recommended_by_user_id: col.owner_id,  // provenance: the curator
      note: rec.note || "",
      rating: null,
      tags: [],
      status: "saved",
      is_anonymous: false,
      degree: 1,
      shared_to_network: false,              // never auto-reshare someone else's list
      rec_date: today,
    });
    if (insErr) return err("import_failed: " + insErr.message, 500);
    have.add(rec.canonical_id);
    imported++;
  }

  return json({ engine: ENGINE, ok: true, imported, skipped, curator: curatorName, title: col.title });
});
