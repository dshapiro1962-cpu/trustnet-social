// ═══════════════════════════════════════════════════════════════════════════
// connector-guards-sim — a connector can DRAFT a question. It cannot SEND one.
//
// That sentence is the whole product promise of the Muse connector. It is
// written on /connect, in the access requirements given to Meta, in the
// privacy policy and in the tool description the calling model reads. This
// sim is what makes it true rather than claimed.
//
// WHY THE CONTROL IS A SABOTAGE, not an old file. Every other sim here names
// the baseline its fix was made against; this is new code, so "before" is a
// file that does not exist and a control against it would FATAL rather than
// fail. `neuter-tests.sh` is the pattern for this case: disable each mechanism
// in turn and REQUIRE a failure. Six sabotages below, each a plausible thing a
// future session might do while "simplifying", each of which must break a
// named guard.
//
//   node connector-guards-sim.js         → live code, must PASS
//   node connector-guards-sim.js --old   → six sabotages, must FAIL
//
// It reads source only, and says so: there is no Deno or TypeScript runtime on
// this machine. What it cannot see, connector-live-sim.js checks against the
// real database.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const sabotage = process.argv.indexOf('--old') > -1;
const FN = path.join(__dirname, '..', 'supabase', 'functions');
// 0054 moved connector_draft_claim and connector_draft_discard, so the SQL
// this sim reasons about is now spread over two files. Concatenated in order,
// which is also the order they were applied.
const MIGS = [
  path.join(__dirname, '..', 'migrations', '0053_a_connector_asks_before_it_sends.sql'),
  path.join(__dirname, '..', 'migrations', '0054_the_press_must_be_the_member.sql'),
];
const MIG = MIGS[0];
const WEB = path.join(__dirname, '..', 'web');

for (const p of [path.join(FN, 'mcp', 'index.ts'),
                 path.join(FN, 'connector-confirm', 'index.ts')].concat(MIGS)) {
  if (!fs.existsSync(p)) { console.log('\n  FATAL: missing ' + p + '\n'); process.exit(2); }
}

// core.autocrlf is true here.
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

let mcp = lf(path.join(FN, 'mcp', 'index.ts'));
let confirm = lf(path.join(FN, 'connector-confirm', 'index.ts'));
let mig = MIGS.map(lf).join('\n');
const connectPage = lf(path.join(WEB, 'connect.html'));
const confirmPage = lf(path.join(WEB, 'confirm.html'));

// ── THE SABOTAGES ───────────────────────────────────────────────────────────
// Each is a change someone could genuinely make. If a guard below survives one
// of them, that guard is decoration.
const SABOTAGES = [
  ['the MCP server gains a send path',
   () => { mcp = mcp.replace('async function runTool(',
     'async function sendNow(t: string, b: unknown) {\n'
     + '  return await callFunction("send-query", t, b);\n}\n\nasync function runTool('); }],
  ['draft_question stops saying it did not send',
   () => { mcp = mcp.replace('      drafted: true,\n      sent: false,', '      drafted: true,'); }],
  ['a read stops going through the member session',
   () => { mcp = mcp.replace('    const sb = asMember(sess.accessToken);\n    const { data, error } = await sb\n      .from("circles")',
     '    const sb = adminClient();\n    const { data, error } = await sb\n      .from("circles")'); }],
  ['confirm sends before it claims',
   () => { confirm = confirm.replace(
     '  const { data: claim, error: cErr } = await admin.rpc("connector_draft_claim", {',
     '  const early = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/send-query");\n'
     + '  const { data: claim, error: cErr } = await admin.rpc("connector_draft_claim", {'); }],
  // A GLOBAL regex, not a literal string. The literal was written against
  // 0053 and stopped matching the moment 0054 inserted the ownership line into
  // the same WHERE — so the sabotage went on editing 0053's SUPERSEDED claim
  // and broke nothing, while still reporting itself as a disabled mechanism.
  // A control that silently stops controlling is worse than one that fails.
  ['the single-use gate comes out of the UPDATE',
   () => { mig = mig.replace(
     /\s+and confirmed_at is null\s+and discarded_at is null\s+and expires_at > now\(\)/g, ''); }],
  ['the ownership check comes out of the claim',
   () => { mig = mig.replace('     and owner_id = p_user_id', '     and true'); }],
  ['connector-confirm stops checking who is pressing',
   () => { confirm = confirm.replace('const presser = await callerId(req);',
     'const presser = "anyone";'); }],
  ['the confirm view starts handing out phone numbers',
   () => { mig = mig.replace('select coalesce(array_agg(m.name order by m.name), \'{}\')',
     'select coalesce(array_agg(m.contact_value order by m.name), \'{}\')'); }],
];

if (sabotage) SABOTAGES.forEach(function (s) { s[1](); });

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

// Structural assertions must read CODE, not the comments that describe it.
// This sim's own subject matter is full of sentences like "never calls
// send-query", and a guard that matched those would pass for the wrong reason
// — which is worse than no guard, and has happened here before.
const codeOnly = (src) => src.split('\n')
  .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
  .join('\n');
const mcpCode = codeOnly(mcp), confirmCode = codeOnly(confirm), migCode = codeOnly(mig);

console.log('\n── connector guards ── '
  + (sabotage ? 'SABOTAGED (' + SABOTAGES.length + ' mechanisms disabled)' : 'live')
  + ' ──\n');
console.log('  (source structure only — there is no Deno on this machine;');
console.log('   connector-live-sim.js checks behaviour against the database)\n');

// ── 1 · IT CANNOT SEND ─────────────────────────────────────────────────────
console.log('  the promise:');

ck('the MCP server never calls send-query',
   !/send-query/.test(mcpCode));
ck('...and never reaches a delivery channel directly',
   !/sendWhatsApp|sendEmail|channels\.ts|graph\.facebook\.com/.test(mcpCode));
ck('...and cannot resend to a member either',
   !/resend-member/.test(mcpCode));
ck('draft_question states that it did not send',
   /drafted: true,\s*\n\s*sent: false,/.test(mcpCode));
ck('...and hands back something the member must open',
   /confirm_url:/.test(mcpCode));
ck('...and gives the assistant words to say so out loud',
   /tell_the_member:/.test(mcpCode));
ck('the tool description tells the model it does not send',
   /THIS DOES NOT SEND ANYTHING/.test(mcp));
ck('exactly one function in the whole connector can send',
   /send-query/.test(confirmCode) && !/send-query/.test(mcpCode));

// ── 2 · THE SINGLE-USE GATE ────────────────────────────────────────────────
// Two taps must send one message. The gate is in the WHERE of the UPDATE, not
// in a read-then-write, because a read-then-write races itself.
console.log('\n  one press, one send:');

// Scoped to connector_draft_claim's OWN body. Unscoped, this matched
// connector_draft_discard - which has an identical WHERE - so the gate could
// be removed from the claim and the guard stayed green. Caught by running the
// sabotage, which is the only reason to write one.
// THE LAST DEFINITION WINS, not the first. 0053 defines a two-argument claim
// and 0054 drops it and defines the three-argument one, so the combined text
// holds both and `split(...)[1]` handed back the SUPERSEDED body — which made
// the ownership checks below fail against perfectly correct code. Migrations
// accumulate; anything reading them as one document has to read the last
// definition of a thing, the way the database does.
const claimParts = migCode.split('create or replace function public.connector_draft_claim');
const claimBody = (claimParts.length > 1 ? claimParts[claimParts.length - 1] : '')
  .split('create or replace function')[0];
ck('the claim is an UPDATE guarded by confirmed_at is null',
   /update public\.connector_drafts[\s\S]{0,300}?and confirmed_at is null/.test(claimBody));
ck('...and an expired draft cannot be claimed',
   /and expires_at > now\(\)/.test(claimBody));
ck('...and a discarded one cannot either',
   /and discarded_at is null/.test(claimBody));
ck('the claim happens BEFORE anything is sent',
   confirmCode.indexOf('connector_draft_claim') < confirmCode.indexOf('functions/v1/send-query'));
ck('a claim that returns false sends nothing',
   /c\.claimed !== true\) return json\([\s\S]{0,80}sent: false/.test(confirmCode));
ck('the outcome is read from the ROW, not from the absence of an error',
   /claimed', false/.test(migCode) && /claimed', true/.test(migCode));

// ── 2b · THE PRESS MUST BE THE MEMBER ──────────────────────────────────────
// 0053 claimed the connector "cannot send" and did not keep it:
// draft_question hands the confirm_url to the CALLER, and that token was the
// whole credential the send required. Holding a connector token was therefore
// enough to draft and then send. 0054 made sending require being the member.
console.log('\n  the press is the member:');

ck('the claim takes the member doing it',
   /connector_draft_claim\([\s\S]{0,200}?p_user_id\s+uuid/.test(migCode));
ck('...and the UPDATE checks the draft is theirs',
   /and owner_id = p_user_id/.test(claimBody));
ck('...in the SAME statement as the single-use gate, not a read before a write',
   /and owner_id = p_user_id[\s\S]{0,120}?and confirmed_at is null/.test(claimBody));
ck('the two-argument claim is GONE, not left beside it',
   /drop function if exists public\.connector_draft_claim\(text, text\)/.test(migCode));
ck('connector-confirm resolves who is pressing',
   /const presser = await callerId\(req\);/.test(confirmCode));
ck('...refuses before anything is claimed, so no session cannot burn the draft',
   confirmCode.indexOf('const presser') < confirmCode.indexOf('connector_draft_claim'));
ck('...and passes that member into the claim',
   /p_user_id: presser/.test(confirmCode));
ck('the anon key is not accepted as a session',
   /getUser\(\)/.test(confirmCode));
ck('discarding is the member’s too',
   /connector_draft_discard[\s\S]{0,160}?p_user_id/.test(confirmCode));

// ── 3 · ISOLATION IS THE DATABASE'S JOB ────────────────────────────────────
console.log('\n  isolation:');

ck('reads run through a real member session, not the service role',
   /const sb = asMember\(sess\.accessToken\);/.test(mcpCode));
ck('the member client is built from the member access token',
   /Authorization: "Bearer " \+ accessToken/.test(mcpCode));
ck('no read filters by owner_id by hand',
   !/\.eq\("owner_id"/.test(mcpCode));
// The presence of asMember() somewhere is not evidence that a PARTICULAR read
// uses it: switching list_circles to the service role left the other two
// intact and the guard green. This asserts the dangerous shape directly - a
// service-role client reading a member-owned table. connector_drafts is
// excluded on purpose: it is our own table, it has no RLS policies, and the
// draft insert is legitimately admin.
ck('no service-role client reads a member-owned table',
   !/adminClient\(\)[\s\S]{0,240}?\.from\("(circles|queries|recommendations|members|canonicals)"/.test(mcpCode));
ck('the circle behind a draft is resolved under the member session too',
   /const sb = asMember\(sess\.accessToken\);[\s\S]{0,400}?\.from\("circles"\)\.select\("id, name"\)\.eq\("id", circleId\)/.test(mcpCode));
// The schema qualifier is optional here on purpose. pgcrypto lives in
// `extensions` on Supabase, and pinning this guard to the unqualified spelling
// made it fail the moment that was fixed - a false alarm about a correct
// change. What must never change is that what gets stored is a DIGEST of the
// token, which is what this now says.
ck('a token is stored only as a hash',
   /encode\((extensions\.)?digest\(v_token, 'sha256'\), 'hex'\)/.test(migCode));
ck('...and the plaintext is never written to a column',
   !/insert into public\.connector_tokens[\s\S]{0,200}?values \(v_uid, v_token/.test(migCode));
ck('a revoked token resolves to nobody',
   /and revoked_at is null/.test(migCode));

// ── 4 · NAMES, NOT NUMBERS ─────────────────────────────────────────────────
// The privacy policy and the access requirements both promise in writing that
// a connector cannot read a circle's phone numbers. The confirm page is the
// only surface where that could have leaked, because it must show WHO.
console.log('\n  names, never numbers:');

ck('the confirm view aggregates names',
   /array_agg\(m\.name order by m\.name\)/.test(migCode));
ck('...and returns no contact_value anywhere',
   !/contact_value/.test(migCode));
ck('list_circles returns counts, not people',
   /members\(count\)/.test(mcpCode) && !/members\(name/.test(mcpCode));
ck('the confirm page is told it is showing names',
   /recipients/.test(confirmPage));

// ── 5 · WHAT THE MEMBER WAS PROMISED ───────────────────────────────────────
// /connect states four things a connector cannot do. Every one has to be true
// of the code above, or the page is a lie with a button under it.
console.log('\n  the page and the code agree:');

ck('connect promises it cannot message anyone', /Message anyone/.test(connectPage));
ck('connect promises it cannot see who is in a circle',
   /See who is in your circles/.test(connectPage));
ck('connect promises the database enforces the rest',
   /The database\s*\n?\s*enforces this/.test(connectPage.replace(/\s+/g, ' '))
   || /database\s+enforces this/.test(connectPage.replace(/\s+/g, ' ')));
ck('connect offers revocation, and the table supports it',
   /revoked_at/.test(connectPage) && /revoked_at/.test(migCode));
ck('the confirm page never sends on load — only from the button',
   /\$\('send'\)\.addEventListener/.test(confirmPage)
   && !/action: 'send'[\s\S]{0,200}?\}\)\;\s*\n\s*\}\)\(\)/.test(confirmPage));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (sabotage) {
  console.log(fail > 0
    ? '  CONTROL OK — sabotaging the mechanisms breaks ' + fail + ' guard(s).\n'
    : '  CONTROL BROKEN — every guard survived the sabotage. They measure nothing.\n');
  process.exit(fail > 0 ? 0 : 1);
}
process.exit(fail ? 1 : 0);
