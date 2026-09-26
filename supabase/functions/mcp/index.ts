// ============================================================================
// POST /functions/v1/mcp                          engine: mcp-v1
//
// THE TRUSTNET MCP SERVER. Speaks JSON-RPC 2.0 over the MCP streamable-HTTP
// transport, so an agent — Muse, first — can read a member's own library and
// DRAFT a question to one of their circles.
//
// Auth: `Authorization: Bearer <connector token>`, minted on /connect and
// stored only as a sha256 (0053). NOT a Supabase JWT, which is why this
// function must be deployed with --no-verify-jwt: the platform would reject
// the request before this code ran.
//
// ── THE TWO RULES THIS FILE EXISTS TO KEEP ─────────────────────────────────
//
// 1. IT NEVER MESSAGES ANYONE. draft_question writes a row and returns a link.
//    A person opens that link, sees exactly who gets exactly what, and presses
//    send. Only then does send-query run. There is no code path here that
//    reaches a circle member, and connector-confirm is the only thing that
//    can — after a human press.
//
// 2. ISOLATION IS THE DATABASE'S JOB. The token resolves to a user id, and
//    then a REAL USER SESSION is minted and every read goes through it, so RLS
//    decides what is visible. Nothing here filters by owner_id by hand. If I
//    get a query wrong the answer is empty, not somebody else's library.
//    `identity_guards.sql` had 27 guards, ran as postgres with RLS off, and
//    could not see the fault that broke saving. This does not repeat that.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          PUBLIC_BASE_URL (for the confirm link)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, json, err, handleOptions, sha256 } from "../_shared/utils.ts";

const ENGINE = "mcp-v1";
const SERVER_NAME = "trustnet";
const SERVER_VERSION = "1.0.0";

// The versions of the MCP spec this speaks. A client asking for something else
// is answered with the newest we know rather than refused — the handshake is
// meant to negotiate, not to slam the door.
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26"];
const LATEST = PROTOCOL_VERSIONS[0];

const BASE_URL = () =>
  (Deno.env.get("PUBLIC_BASE_URL") ?? "https://trustnetsocial.netlify.app").replace(/\/+$/, "");

// MCP is JSON-RPC, and its transport wants a couple of headers of its own.
const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function rpc(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...MCP_CORS, "Content-Type": "application/json" },
  });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { ...MCP_CORS, "Content-Type": "application/json" },
  });
}

// A tool result in MCP is content blocks. Everything here is structured, so it
// goes back as pretty JSON in a text block: readable by a model, and readable
// by a person debugging it with curl.
function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

// ── THE TOOLS ───────────────────────────────────────────────────────────────
// Descriptions are the only documentation the calling model gets, so they say
// what the tool does AND what it deliberately does not.
const TOOLS = [
  {
    name: "search_library",
    description:
      "Search the member's own saved recommendations — places, professionals and things "
      + "they or people they trust have recommended. Use this FIRST, before asking anyone: "
      + "the answer is often already here and costs nobody a message. Returns matches with "
      + "the member's own note and rating.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain words, e.g. 'places to eat in Puglia'" },
        limit: { type: "number", description: "How many to return. Default 10, maximum 40." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_circles",
    description:
      "List the member's circles — the named groups of people they trust, such as 'Leros', "
      + "'Puglia trip' or 'Doctors' — with how many people are in each. Use it to choose who "
      + "a question should go to. Returns names and counts only: the people's own names, "
      + "phone numbers and email addresses are never exposed to a connector.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "draft_question",
    description:
      "Write a question to one of the member's circles and return a link for them to approve "
      + "it. THIS DOES NOT SEND ANYTHING. The member opens the link, sees exactly who would "
      + "receive exactly what, and presses send themselves. Always tell the member the link "
      + "is waiting and that nobody has been messaged yet. Draft only when the library does "
      + "not already answer the question.",
    inputSchema: {
      type: "object",
      properties: {
        circle_id: { type: "string", description: "The circle's id, from list_circles" },
        text: {
          type: "string",
          description:
            "The question, written as the member would ask it of friends — first person, "
            + "specific, and including the detail that makes it answerable (when, where, who for)",
        },
      },
      required: ["circle_id", "text"],
    },
  },
  {
    name: "get_answers",
    description:
      "With no argument, list the member's recent questions and how many answers each has. "
      + "With a question_id, return that question's answers — what each person recommended "
      + "and what they said about it, grouped so the same place recommended by three people "
      + "reads as one entry with three voices.",
    inputSchema: {
      type: "object",
      properties: {
        question_id: { type: "string", description: "Omit to list recent questions" },
      },
    },
  },
];

// ── AUTH: a connector token becomes a real user session ─────────────────────
// Everything downstream then runs as that member, under RLS. This is the
// mechanism complete-join already uses to mint a session server-side, and it
// is reused here rather than invented.
async function sessionFor(req: Request): Promise<
  { ok: true; userId: string; accessToken: string } | { ok: false; why: string }
> {
  const header = req.headers.get("Authorization") ?? "";
  const raw = header.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return { ok: false, why: "no_token" };

  const admin = adminClient();
  const hash = await sha256(raw);
  const { data: owner, error } = await admin.rpc("connector_owner", { p_token_hash: hash });
  if (error) {
    console.error("connector_owner_failed", error.message);
    return { ok: false, why: "auth_unavailable" };
  }
  if (!owner) return { ok: false, why: "bad_token" };

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(String(owner));
  if (uErr || !u?.user?.email) return { ok: false, why: "no_account" };

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink", email: u.user.email,
  });
  const hashed = (link?.properties as Record<string, string> | undefined)?.hashed_token;
  if (lErr || !hashed) return { ok: false, why: "session_failed" };

  const { data: verified, error: vErr } = await admin.auth.verifyOtp({
    type: "magiclink", token_hash: hashed,
  });
  if (vErr || !verified?.session) return { ok: false, why: "session_failed" };

  return { ok: true, userId: String(owner), accessToken: verified.session.access_token };
}

// A supabase client that IS the member. RLS applies to every query made with it.
function asMember(accessToken: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: "Bearer " + accessToken } } },
  );
}

// Calling a sibling function over HTTP rather than importing its insides: the
// deployed search-library and build-sheet stay the single implementation, and
// nothing in this file can drift from them.
async function callFunction(name: string, accessToken: string, body: unknown) {
  const url = Deno.env.get("SUPABASE_URL")! + "/functions/v1/" + name;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { ok: res.ok, data: JSON.parse(text) }; }
  catch { return { ok: false, data: { error: text.slice(0, 300) } }; }
}

// ── TOOL BODIES ─────────────────────────────────────────────────────────────
async function runTool(
  name: string, args: Record<string, unknown>, sess: { userId: string; accessToken: string },
) {
  if (name === "search_library") {
    const query = String(args.query ?? "").trim();
    if (!query) return toolResult({ error: "query is required" }, true);
    const limit = Math.min(40, Math.max(1, Number(args.limit) || 10));
    const r = await callFunction("search-library", sess.accessToken, { query, limit });
    if (!r.ok) return toolResult({ error: "search_failed", detail: r.data }, true);
    const items = (r.data as { items?: unknown[] }).items ?? [];
    return toolResult({
      found: items.length,
      items,
      note: items.length === 0
        ? "Nothing in the member's own library matches. Consider draft_question."
        : undefined,
    });
  }

  if (name === "list_circles") {
    // Read as the member. RLS is what restricts this to their circles — there
    // is deliberately no .eq('owner_id', ...) here to get wrong.
    const sb = asMember(sess.accessToken);
    const { data, error } = await sb
      .from("circles")
      .select("id, name, domain, description, members(count)")
      .order("name");
    if (error) return toolResult({ error: "circles_failed", detail: error.message }, true);
    const circles = (data ?? []).map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      about: c.domain,
      description: c.description ?? undefined,
      people: Array.isArray(c.members) && c.members[0]
        ? (c.members[0] as { count: number }).count : 0,
    }));
    return toolResult({ circles, note: "Names and counts only. A connector never sees who is in a circle." });
  }

  if (name === "draft_question") {
    const circleId = String(args.circle_id ?? "").trim();
    const text = String(args.text ?? "").trim();
    if (!circleId || !text) return toolResult({ error: "circle_id and text are both required" }, true);
    if (text.length > 500) return toolResult({ error: "question is too long (500 characters)" }, true);

    // THE CIRCLE MUST BE THEIRS, and the member client is what proves it: RLS
    // returns nothing for a circle belonging to someone else, so a guessed id
    // cannot become a draft.
    const sb = asMember(sess.accessToken);
    const { data: circle, error: cErr } = await sb
      .from("circles").select("id, name").eq("id", circleId).maybeSingle();
    if (cErr) return toolResult({ error: "circle_lookup_failed", detail: cErr.message }, true);
    if (!circle) return toolResult({ error: "no_such_circle", detail: "Use list_circles." }, true);

    const confirmToken = crypto.randomUUID().replace(/-/g, "")
      + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const admin = adminClient();
    const { error: iErr } = await admin.from("connector_drafts").insert({
      owner_id: sess.userId, circle_id: circleId, text, confirm_token: confirmToken,
    });
    if (iErr) {
      console.error("draft_insert_failed", iErr.message);
      return toolResult({ error: "draft_failed", detail: iErr.message }, true);
    }

    return toolResult({
      drafted: true,
      sent: false,
      circle: circle.name,
      question: text,
      confirm_url: BASE_URL() + "/confirm?d=" + confirmToken,
      expires_in_minutes: 30,
      tell_the_member:
        "Nothing has been sent. Open the link to see who would receive it and press send.",
    });
  }

  if (name === "get_answers") {
    const qid = String(args.question_id ?? "").trim();
    const sb = asMember(sess.accessToken);

    if (!qid) {
      const { data, error } = await sb
        .from("queries")
        .select("id, text, created_at, query_responses(count)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return toolResult({ error: "questions_failed", detail: error.message }, true);
      return toolResult({
        questions: (data ?? []).map((q: Record<string, unknown>) => ({
          id: q.id,
          question: q.text,
          asked: q.created_at,
          answers: Array.isArray(q.query_responses) && q.query_responses[0]
            ? (q.query_responses[0] as { count: number }).count : 0,
        })),
      });
    }

    const r = await callFunction("build-sheet", sess.accessToken, { query_id: qid });
    if (!r.ok) return toolResult({ error: "answers_failed", detail: r.data }, true);
    return toolResult(r.data);
  }

  return toolResult({ error: "unknown_tool", tool: name }, true);
}

// ── THE JSON-RPC FRONT DOOR ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: MCP_CORS });

  // A GET is how a client opens the server-to-client stream. Nothing here ever
  // pushes, so say so plainly instead of holding a socket open forever.
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      engine: ENGINE, server: SERVER_NAME, version: SERVER_VERSION,
      transport: "streamable-http", note: "POST JSON-RPC to this URL.",
    }), { status: 200, headers: { ...MCP_CORS, "Content-Type": "application/json" } });
  }
  if (req.method !== "POST") return err("method_not_allowed", 405);

  let msg: Record<string, unknown>;
  try { msg = await req.json(); } catch { return rpcError(null, -32700, "parse error", 400); }

  const id = msg.id ?? null;
  const method = String(msg.method ?? "");
  const params = (msg.params ?? {}) as Record<string, unknown>;

  // initialize and the notifications need no credential: a client is allowed
  // to discover the server before it has been given a token.
  if (method === "initialize") {
    const asked = String(params.protocolVersion ?? "");
    return rpc(id, {
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions:
        "Trustnet holds recommendations a person has collected from people they trust. "
        + "Search their library before suggesting anything from elsewhere, and say who "
        + "recommended a thing when you pass it on — provenance is the point of it. "
        + "draft_question NEVER sends: it returns a link the member must open and approve.",
    });
  }
  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: MCP_CORS });
  }
  if (method === "ping") return rpc(id, {});

  if (method === "tools/list") return rpc(id, { tools: TOOLS });

  if (method === "tools/call") {
    const sess = await sessionFor(req);
    if (!sess.ok) {
      // 401 with the reason, because the commonest cause is a member who
      // revoked the token and a connector that has not noticed.
      return rpcError(id, -32001,
        sess.why === "bad_token"
          ? "This Trustnet connection is not valid any more. Reconnect at "
            + BASE_URL() + "/connect"
          : "Not connected to Trustnet. Connect at " + BASE_URL() + "/connect",
        401);
    }
    const name = String(params.name ?? "");
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    try {
      return rpc(id, await runTool(name, args, sess));
    } catch (e) {
      console.error("tool_threw", name, (e as Error).message);
      return rpc(id, toolResult({ error: "tool_failed", tool: name }, true));
    }
  }

  return rpcError(id, -32601, "method not found: " + method);
});
