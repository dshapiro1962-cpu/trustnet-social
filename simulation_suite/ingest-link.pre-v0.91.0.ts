// ============================================================================
// POST /functions/v1/ingest-link              engine: ingest-link-v2-image
// The share-sheet trick, phase one: given any URL (TikTok, Booking, Google
// Maps, a blog...), fetch the page server-side and let the AI extract WHAT is
// being recommended. Returns extraction only — the app pre-fills the Add form
// and the user confirms (visible filing, per design). No DB writes here.
// v2: also returns image_url (og:image, absolutised) for library thumbnails.
// Auth: caller JWT. Requires secret: OPENAI_API_KEY
// ============================================================================
import { getUserId, json, err, handleOptions } from "../_shared/utils.ts";

const ENGINE = "ingest-link-v2-image";
const CATEGORIES = ["dining","travel","healthcare","home","culture","hobbies","professional","other"];

interface Body { url: string; }

function pick(re: RegExp, s: string): string {
  const m = s.match(re);
  return m ? m[1].trim() : "";
}

Deno.serve(async (req: Request) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  if (req.method !== "POST") return err("method_not_allowed", 405);

  const userId = await getUserId(req);
  if (!userId) return err("unauthorized", 401);

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "openai_not_configured" }, 502);

  let body: Body;
  try { body = await req.json(); } catch { return err("invalid_json"); }
  const url = (body.url || "").trim();
  if (!/^https?:\/\/.+/i.test(url)) return err("invalid_url");

  // ── 1. Fetch the page (8s timeout, 300KB cap, browser-ish UA) ─────────────
  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": "en,he;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return json({ error: "fetch_failed_" + res.status }, 502);
    html = (await res.text()).slice(0, 300_000);
  } catch (_) {
    return json({ error: "fetch_failed_network" }, 502);
  }

  // ── 2. Distill the page to its useful text ────────────────────────────────
  const title = pick(/<title[^>]*>([^<]{1,300})/i, html);
  const ogTitle = pick(/property=["']og:title["'][^>]*content=["']([^"']{1,300})/i, html)
    || pick(/content=["']([^"']{1,300})["'][^>]*property=["']og:title/i, html);
  const ogDesc = pick(/property=["']og:description["'][^>]*content=["']([^"']{1,600})/i, html)
    || pick(/content=["']([^"']{1,600})["'][^>]*property=["']og:description/i, html);
  const metaDesc = pick(/name=["']description["'][^>]*content=["']([^"']{1,600})/i, html);
  const siteName = pick(/property=["']og:site_name["'][^>]*content=["']([^"']{1,120})/i, html);
  // v2: og:image for the library thumbnail (absolutise relative URLs)
  const ogImgRaw = pick(/property=["']og:image["'][^>]*content=["']([^"']{1,500})/i, html)
    || pick(/content=["']([^"']{1,500})["'][^>]*property=["']og:image/i, html);
  let imageUrl: string | null = null;
  if (ogImgRaw) { try { imageUrl = new URL(ogImgRaw, url).href.slice(0, 500); } catch (_) { /* skip bad url */ } }
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 3000);

  const pageText = [
    "URL: " + url,
    siteName ? "site: " + siteName : "",
    ogTitle || title ? "title: " + (ogTitle || title) : "",
    ogDesc || metaDesc ? "description: " + (ogDesc || metaDesc) : "",
    "page text: " + bodyText,
  ].filter(Boolean).join("\n");

  // ── 3. AI extraction ──────────────────────────────────────────────────────
  let out: Record<string, unknown> = {};
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
              "A user pasted a link to something they want to save as a recommendation " +
              "(a restaurant, hotel, book, product, doctor, place...). From the page content, " +
              "identify the SINGLE thing being recommended. Content may be Hebrew or English. " +
              "Respond JSON only: {\"name\": the thing's name (NOT the website's name), " +
              "\"location\": city/area if any else \"\", " +
              "\"category\": one of [" + CATEGORIES.map((c) => '"' + c + '"').join(",") + "], " +
              "\"tags\": [3-6 short lowercase tags in the content's language], " +
              "\"note\": a natural <=140 char recommendation note based on the content, " +
              "\"confident\": true/false whether you clearly identified a specific thing}",
          },
          { role: "user", content: pageText },
        ],
      }),
    });
    if (!chat.ok) {
      const detail = await chat.text();
      return json({ error: "openai_" + chat.status + ": " + detail.slice(0, 200) }, 502);
    }
    const c = await chat.json();
    out = JSON.parse(c.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    return json({ error: "openai_exception: " + String(e).slice(0, 150) }, 502);
  }

  const category = CATEGORIES.includes(out.category as string) ? out.category : "other";
  return json({
    engine: ENGINE,
    name: typeof out.name === "string" ? out.name.slice(0, 80) : "",
    location: typeof out.location === "string" ? out.location.slice(0, 80) : "",
    category,
    tags: Array.isArray(out.tags) ? (out.tags as unknown[]).filter((t) => typeof t === "string").slice(0, 6) : [],
    note: typeof out.note === "string" ? out.note.slice(0, 140) : "",
    needs_review: out.confident !== true,
    source_title: ogTitle || title || "",
    image_url: imageUrl,
    url,
  });
});
