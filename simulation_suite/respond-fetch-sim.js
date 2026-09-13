// respond-fetch-sim.js — the Fetch box in the answer dialog, and the auth it
// needed to exist at all.
//
// dan, 13 Sep: "we need the fetch function as we have in the add library
// dialog box, in the answer dialog box" — the dialog where he answers someone
// else's query, i.e. respond.html.
//
// WHY THIS WAS NOT A UI JOB. Everyone answers through respond.html?t=<token>,
// signed-in members included — the Inbox card links to it in a new tab
// (web/index.html:3443). The page is account-free by design. But ingest-link
// was gated twice: the platform verified a JWT before the code ran, and the
// code then demanded getUserId(). So the Fetch box had nobody to authenticate
// as.
//
// Opening ingest-link to anonymous callers was not acceptable: it fetches any
// URL server-side and calls OpenAI, so it would have become a free scraping
// proxy on dan's bill. It now takes the SAME response token the page already
// holds — the pattern response-meta and receive-response already use — and
// requires it to be unused and inside its 72-hour life.
//
// AND THE PLATFORM CHECK IS NOW OFF FOR THAT FUNCTION, which means the code
// below IS the door. That is what most of this sim is about.
//
// A THIRD THING, FOUND WHILE DOING IT. .github/workflows/deploy-functions.yml
// listed only "whatsapp-webhook get-collection" as no-verify-jwt, while
// production has had response-meta and receive-response unauthenticated since
// they were written. The first run of that workflow would have redeployed both
// WITH verification and killed the answer loop outright — nobody could load a
// question or send an answer. Asserted here so it cannot drift again.
//
//   node respond-fetch-sim.js         → must PASS
//   node respond-fetch-sim.js --old   → the pre-v0.91.0 files, must FAIL
//
// Needs .env.local for TRUSTNET_DB_URL to check real tokens; skips cleanly
// without it. READ ONLY — writes nothing.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

const useOld = process.argv.indexOf('--old') > -1;
const INGEST = useOld
  ? path.join(__dirname, 'ingest-link.pre-v0.91.0.ts')
  : path.join(REPO, 'supabase', 'functions', 'ingest-link', 'index.ts');
const RESPOND = useOld
  ? path.join(__dirname, 'respond.pre-v0.91.0.html')
  : path.join(REPO, 'web', 'respond.html');
const WORKFLOW = path.join(REPO, '.github', 'workflows', 'deploy-functions.yml');

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {

const ingest = fs.readFileSync(INGEST, 'utf8');
const respond = fs.readFileSync(RESPOND, 'utf8');
const code = ingest.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n   fixtures: ' + path.basename(INGEST) + ', ' + path.basename(RESPOND)
  + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1. THE DOOR ──────────────────────────────────────────────────────────
console.log('== the door, now that the platform no longer checks the JWT ==\n');

ck('ingest-link accepts a response_token', /response_token/.test(code),
   'without it the Fetch box in respond.html has nothing to authenticate with');
ck('a caller with neither a user nor a token is refused',
   /if \(!rt\) return err\("unauthorized", 401\)/.test(code),
   'this is the whole door now — the platform check is off');
ck('a USED token is refused', /token_already_used/.test(code));
ck('an EXPIRED token is refused', /token_expired/.test(code));
ck('the token is looked up on the ROW, not trusted as given',
   /from\("query_responses"\)/.test(code) && /response_token/.test(code));
ck('a token matching nothing is refused rather than passed',
   /if \(!resp\) return err\("unauthorized", 401\)/.test(code),
   'maybeSingle returns no error and no row for a token that does not exist');
ck('a signed-in caller still gets through unchanged',
   /const userId = await getUserId\(req\)/.test(code) && /if \(!userId\) \{/.test(code));

// ── 2. THE SSRF GUARD, run for real ─────────────────────────────────────
// ingest-link retrieves whatever URL it is handed, from inside Supabase's
// network. Widening who may call it makes that worth guarding.
console.log('\n== the URL guard, running the real function ==\n');

// Strip the type annotations so the REAL body can run here. Longest first, or
// ": URL" would bite half of ": URL | null" and leave "| null" behind.
const fn = (ingest.match(/function publicHttpUrl\([\s\S]*?\n\}/) || [''])[0]
  .replace(/:\s*URL\s*\|\s*null/g, '')
  .replace(/:\s*URL\b/g, '')
  .replace(/:\s*string\b/g, '')
  .replace(/ as string/g, '');
ck('ingest-link has a URL guard at all', !!fn,
   'it fetched any host it was given, including link-local metadata');
if (fn) {
  // eslint-disable-next-line no-eval
  const publicHttpUrl = eval('(' + fn.replace(/^function publicHttpUrl/, 'function') + ')');
  const blocked = [
    ['http://localhost:8000/x', 'localhost'],
    ['http://127.0.0.1/x', 'loopback'],
    ['http://169.254.169.254/latest/meta-data/', 'the cloud metadata service'],
    ['http://10.0.0.5/', 'private 10/8'],
    ['http://192.168.1.1/', 'private 192.168/16'],
    ['http://172.16.0.9/', 'private 172.16/12'],
    ['file:///etc/passwd', 'a file: URL'],
    ['ftp://example.com/x', 'a non-http scheme'],
    ['http://[::1]/', 'IPv6 loopback'],
  ];
  let allBlocked = true;
  for (const [u, why] of blocked) {
    const got = publicHttpUrl(u);
    if (got) { allBlocked = false; console.log('        LEAKED: ' + why + '  ' + u); }
  }
  ck('every private, loopback and metadata target is refused', allBlocked);
  const allowed = [
    'https://www.booking.com/hotel/it/masseria.html',
    'https://maps.google.com/?q=matera',
    'http://example.com/a?b=c',
  ];
  const allOk = allowed.every((u) => !!publicHttpUrl(u));
  ck('ordinary public links still pass', allOk,
     'over-blocking here would break the feature it exists to protect');
}

// ── 3. THE PAGE ─────────────────────────────────────────────────────────
console.log('\n== the answer dialog itself ==\n');
ck('respond.html has the link field', /id="rec-url"/.test(respond));
ck('...and a Fetch button', /id="rec-url-btn"/.test(respond));
ck('it posts the token with the url',
   /response_token: token/.test(respond),
   'without the token ingest-link will refuse it');
ck('it calls ingest-link', /\/ingest-link/.test(respond));
ck('it NEVER overwrites what the person already typed',
   /!el\.value\.trim\(\)/.test(respond),
   'a fetch after typing must not wipe the answer');
ck('a failed fetch tells them to fill it in themselves',
   /fill it in yourself/.test(respond),
   'silence is the one unacceptable outcome');

// ── 4. THE WORKFLOW LANDMINE ────────────────────────────────────────────
console.log('\n== the deploy workflow, which would have broken answering ==\n');
const wf = fs.readFileSync(WORKFLOW, 'utf8');
const line = (wf.match(/NO_JWT="([^"]*)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
for (const fnName of ['response-meta', 'receive-response', 'ingest-link']) {
  ck('the workflow deploys ' + fnName + ' without jwt verification',
     line.indexOf(fnName) > -1,
     'respond.html is account-free; verifying a JWT here kills the answer loop');
}
ck('and it still exempts the two it always did',
   line.indexOf('whatsapp-webhook') > -1 && line.indexOf('get-collection') > -1);

// ── 5. REAL TOKENS ──────────────────────────────────────────────────────
const envPath = path.join(REPO, '.env.local');
const m0 = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, 'utf8').match(/^TRUSTNET_DB_URL\s*=\s*(.+)$/m) : null;
if (!m0) {
  console.log('\n  (no TRUSTNET_DB_URL — skipping the live token checks)\n');
} else {
  console.log('\n== the same predicate, against real tokens ==\n');
  const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));
  const c = new Client({ connectionString: m0[1].trim(),
                         ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const rows = (await c.query(
    `select count(*)::int total,
            count(*) filter (where token_used)::int used,
            count(*) filter (where token_expires_at < now())::int expired,
            count(*) filter (where not token_used and token_expires_at > now())::int live
       from query_responses where response_token is not null`)).rows[0];
  console.log('        response tokens: ' + rows.total + ' total, ' + rows.live
    + ' live, ' + rows.used + ' used, ' + rows.expired + ' expired\n');
  ck('the columns the check reads exist and are populated', rows.total > 0);
  ck('there is something for each branch to have been wrong about',
     rows.used + rows.expired > 0,
     'with no used or expired tokens the refusals above are untested in practice');
  await c.end();
}

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message + '\n'); process.exit(1); });
