// ============================================================================
// GET /functions/v1/check-reciprocal?member_user_id={uuid}&domain={domain}
// Returns whether the person being added already has the caller in a
// same-domain circle. Informational only — never returns circle contents.
// ============================================================================
import { adminClient, getUserId, json, err, handleOptions } from "../_shared/utils.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const url = new URL(req.url);
  const memberUserId = url.searchParams.get("member_user_id");
  const domain = url.searchParams.get("domain");
  if (!memberUserId) return json({ reciprocal: false }); // contact not on platform

  const admin = adminClient();

  // Does memberUserId own a circle (optionally same domain) that contains
  // the caller as a linked member?
  let q = admin
    .from("circles")
    .select("id, name, members!inner(linked_user_id)")
    .eq("owner_id", memberUserId)
    .eq("members.linked_user_id", userId);
  if (domain) q = q.eq("domain", domain);

  const { data, error } = await q.limit(1);
  if (error) return err("check_failed", 500);

  if (data && data.length > 0) {
    return json({ reciprocal: true, circle_name: data[0].name });
  }
  return json({ reciprocal: false });
});
