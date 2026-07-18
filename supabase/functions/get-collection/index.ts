// ============================================================================
// /functions/v1/get-collection            engine: get-collection-v1
// PUBLIC (deploy with --no-verify-jwt): serves a shared collection by token.
// POST { token } → { title, description, curator, items[] }
// Powers web/collection.html — the page a curator's friends receive.
// ============================================================================
import { adminClient, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "get-collection-v2";

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let token = "";
  if (req.method === "POST") {
    try { token = ((await req.json()).token || "").trim(); } catch (_) { /* fall through */ }
  } else {
    token = (new URL(req.url).searchParams.get("t") || "").trim();
  }
  if (!token) return err("token_required");

  const admin = adminClient();

  const { data: col, error: cErr } = await admin
    .from("collections").select("*").eq("token", token).single();
  if (cErr || !col) return err("collection_not_found", 404);

  const { data: me } = await admin
    .from("users").select("name").eq("id", col.owner_id).single();

  const { data: rows, error: iErr } = await admin
    .from("collection_items")
    .select("position, recommendations(id, note, rating, canonicals(id, name, location, primary_category, image_emoji, image_url, website_url))")
    .eq("collection_id", col.id)
    .order("position", { ascending: true });
  if (iErr) return err("items_load_failed: " + iErr.message, 500);

  const items = (rows ?? []).map((r: any) => {
    const rec = r.recommendations;
    const can = rec?.canonicals;
    if (!can) return null;
    return {
      name: can.name,
      location: can.location || "",
      category: can.primary_category || "",
      emoji: can.image_emoji || "\u{1F4CC}",
      image_url: can.image_url || null,
      website_url: can.website_url || null,
      note: rec.note || "",
      rating: rec.rating || null,
    };
  }).filter(Boolean);

  return json({
    engine: ENGINE,
    owner_id: col.owner_id,
    title: col.title,
    description: col.description || "",
    curator: me?.name || "A Trustnet member",
    count: items.length,
    items,
  });
});
