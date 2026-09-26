// ============================================================================
// Shared utilities for all Trustnet Edge Functions
// Deno runtime. Imported by each function via relative path.
// ============================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return null;
}

// Client scoped to the *caller's* JWT — respects RLS.
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// Service-role client — BYPASSES RLS. Use only for cross-user writes.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Resolve the calling user's id from their JWT. Returns null if unauthenticated.
export async function getUserId(req: Request): Promise<string | null> {
  const supa = userClient(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

// SHA-256 hex of a string (for query text_hash).
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const STOPWORDS = new Set([
  "the","a","an","in","for","of","at","to","is","are","any","best",
  "good","great","my","i","me","what","who","where","near","some",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function jaccard(a: string, b: string): number {
  const setA = new Set(tokenise(a));
  const setB = new Set(tokenise(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return inter / union;
}

export async function normalisedHash(text: string): Promise<string> {
  return await sha256(tokenise(text).sort().join(" "));
}

// ═══ PHONE IDENTITY — ONE RULE (v0.64.0) ════════════════════════════════════
// phoneKey was defined PRIVATELY in wa-signin, complete-join and
// whatsapp-webhook — and the webhook's version was DIFFERENT. It used plain
// digits(), keeping the country code:
//     phoneKey('0545543467')  -> '545543467'      (last 9)
//     digits('0545543467')    -> '0545543467'     (all)
// So for a user whose profile stores '0545543467' while WhatsApp reports
// '972545543467':
//     wa-signin      MATCHED  -> they sign in fine
//     whatsapp-webhook DID NOT -> "this phone isn't linked to an account yet"
// The same person, the same number, recognised by one surface and refused by
// another. Proven by executing both against that pair.
//
// This is the SAME rule as phone_key() in SQL (0017), which backs an indexed
// generated column and a unique constraint — so client, edge and database now
// agree by construction rather than by three people remembering to.
export function phoneKey(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Last nine digits: the national part in Israel, so +972 50 123 4567,
  // 050-123-4567 and 972501234567 are all one person.
  return d.length >= 9 ? d.slice(-9) : d;
}

// E.164 for delivery. Distinct from phoneKey: this is how we SEND to a number,
// phoneKey is how we RECOGNISE it. Conflating them is what produced the bug
// above — a delivery format used as an identity.
export function toE164(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("+")) return d.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}
