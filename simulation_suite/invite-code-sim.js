// ═══════════════════════════════════════════════════════════════════════════
// invite-code-sim — a join is keyed on a code of its own, never on the
// invitation's shared token (0058 / v0.99.10).
//
// Everyone invited to a circle holds the same invite token (0055: one active
// token per circle). The codeless join sent that token in "Join Trustnet: …",
// and the claim, claim_status and complete-join were all keyed on it - so the
// claim belonged to whoever held the link, not to the browser that started
// the join. Now the browser mints a one-off code tied to the invitation, as
// sign-in already did, and the circle comes from the code server-side.
//
//   1  the REAL complete-join in a vm (Node 24 strips the TypeScript)
//   2  the REAL database, as anon, in a transaction ALWAYS rolled back
//      (needs 0058; skipped under --old - the database cannot be put back)
//   3  the REAL app in Chrome: the invite button sends the one-off code
//
//   node invite-code-sim.js         live, must PASS
//   node invite-code-sim.js --old   fn-pre-0058/ + index.pre-v0.99.10.html,
//                                   must FAIL (exit 1)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('module');

const OLD = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const CJ = read(OLD ? path.join(__dirname, 'fn-pre-0058', 'complete-join.ts')
                    : path.join(REPO, 'supabase', 'functions', 'complete-join', 'index.ts'));
const INDEX = read(OLD ? path.join(__dirname, 'index.pre-v0.99.10.html') : path.join(REPO, 'web', 'index.html'));
const UTILS = read(path.join(REPO, 'supabase', 'functions', '_shared', 'utils.ts'));
if (!stripTypeScriptTypes) { console.log('\n  SKIP: this Node cannot strip TypeScript\n'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

// ── 1 · THE REAL complete-join ──────────────────────────────────────────────
const lift = (name) => stripTypeScriptTypes((UTILS.match(new RegExp('export function ' + name + '\\([\\s\\S]*?\\n\\}')) || [''])[0].replace(/^export /, ''));
const HELPERS = lift('phoneKey') + '\n' + lift('toE164');

function load(world) {
  const log = { joined: null, usesOn: null, spentCode: null, sessionFor: null, claimConsumed: false };
  const eqOf = (filters, col) => { const f = filters.find((x) => x[0] === 'eq' && x[1][0] === col); return f ? f[1][1] : undefined; };
  const claimRow = { id: 'claim1', token: world.token, claimed_phone: world.phone, claimed_name: 'Maya',
    consumed_at: null, expires_at: new Date(Date.now() + 600000).toISOString() };
  const resolve = (table, op, filters, payload) => {
    if (table === 'invite_claims') {
      if (op === 'select') return { data: claimRow, error: null };
      if (op === 'update' && payload && payload.finish_used_at) return { data: world.finishOk ? claimRow : null, error: null };
      if (op === 'update') { log.claimConsumed = true; return { data: null, error: null }; }
    }
    if (table === 'signin_tokens') {
      const a = world.attempts[eqOf(filters, 'token')];
      return { data: a ? { token: eqOf(filters, 'token'), invite_token: a.invite_token } : null, error: null };
    }
    if (table === 'circle_invite_links') {
      const tok = eqOf(filters, 'token');
      if (op === 'update') { log.usesOn = tok; return { data: null, error: null }; }
      const l = world.links[tok];
      const wantActive = eqOf(filters, 'active');
      if (!l || (wantActive === true && !l.active)) return { data: null, error: null };
      return { data: Object.assign({ token: tok, uses: 3 }, l), error: null };
    }
    if (table === 'circles') return { data: world.circles[eqOf(filters, 'id')] || null, error: null };
    if (table === 'members') return { data: null, error: null };
    if (table === 'users' && op === 'select') return { data: world.users, error: null };
    return { data: null, error: null };
  };
  const builder = (table) => {
    let op = 'select', payload = null;
    const filters = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res) => res(resolve(table, op, filters, payload));
        if (k === 'maybeSingle' || k === 'single') return async () => resolve(table, op, filters, payload);
        return (...a) => {
          if (/^(insert|update|upsert|delete)$/.test(String(k))) { op = String(k); payload = a[0]; }
          filters.push([String(k), a]);
          return p;
        };
      },
    });
    return p;
  };
  const admin = {
    from: (t) => builder(t),
    rpc: async (name, args) => {
      if (name === 'is_live_signin_token') { const a = world.attempts[args.p_token]; return { data: !!(a && a.live), error: null }; }
      if (name === 'consume_signin_token') { log.spentCode = args.p_token; return { data: true, error: null }; }
      if (name === 'join_circle_as_user') { log.joined = args.p_circle_id; return { data: { ok: true, outcome: 'adopted', member_name: 'Maya' }, error: null }; }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: { id, email: world.authUsers[id] } }, error: null }),
        createUser: async ({ email }) => ({ data: { user: { id: 'new', email } }, error: null }),
        generateLink: async ({ email }) => { log.sessionFor = email; return { data: { properties: { hashed_token: 'h' } }, error: null }; },
      },
      verifyOtp: async () => ({ data: { session: { access_token: 'a', refresh_token: 'r' } }, error: null }),
    },
  };
  let handler = null;
  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    Deno: { serve: (h) => { handler = h; }, env: { get: () => undefined } },
    Request, Response, Headers, URL, JSON, Date, Math,
    adminClient: () => admin,
    json: (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { 'content-type': 'application/json' } }),
    err: (m, s) => new Response(JSON.stringify({ error: m }), { status: s || 400, headers: { 'content-type': 'application/json' } }),
    handleOptions: () => null,
  };
  vm.runInNewContext(HELPERS + '\n' + stripTypeScriptTypes(CJ.replace(/^import [^\n]*\n/gm, '')), ctx, { filename: 'complete-join.ts' });
  return { handler, log };
}
const call = async (handler, body) => {
  const r = await handler(new Request('https://x/functions/v1/complete-join', { method: 'POST', body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const baseWorld = () => ({
  phone: '+972500000001',
  users: [{ id: 'u1', name: 'Maya', phone: '+972500000001' }],
  authUsers: { u1: 'wa500000001@wa.trustnet.local' },
  links: { CIRCLETOK: { circle_id: 'c1', owner_id: 'owner', active: true } },
  circles: { c1: { id: 'c1', name: 'Puglia trip', owner_id: 'owner' } },
  attempts: {},
});

(async () => {
  console.log('\n── 1 · complete-join, the real file ── ' + (OLD ? 'BASELINE fn-pre-0058 (must FAIL)' : 'live') + ' ──\n');
  {
    const w = Object.assign(baseWorld(), { token: 'code1' });
    w.attempts.code1 = { invite_token: 'CIRCLETOK', live: true };
    const { handler, log } = load(w);
    const r = await call(handler, { token: 'code1', phone: w.phone });
    ck('A · a join through its own code joins the circle', r.status === 200 && log.joined === 'c1',
       'status ' + r.status + ', joined ' + log.joined);
    ck('A · ...counts the use against the INVITATION, not the code', log.usesOn === 'CIRCLETOK', String(log.usesOn));
    ck('A · ...and spends the code', log.spentCode === 'code1', String(log.spentCode));
  }
  {
    const w = Object.assign(baseWorld(), { token: 'CIRCLETOK' });
    const { handler, log } = load(w);
    const r = await call(handler, { token: 'CIRCLETOK', phone: w.phone });
    ck('B · the SHARED invite token finishes nothing', r.status === 410 && log.joined === null && log.sessionFor === null,
       'status ' + r.status + ', joined ' + log.joined + ', session for ' + log.sessionFor);
  }
  {
    const w = Object.assign(baseWorld(), { token: 'code2' });
    w.attempts.code2 = { invite_token: null, live: true };
    const { handler, log } = load(w);
    const r = await call(handler, { token: 'code2', phone: w.phone });
    ck('C · a plain sign-in code signs in and joins nothing',
       r.status === 200 && log.joined === null && log.spentCode === 'code2' && !!log.sessionFor);
  }
  {
    const w = Object.assign(baseWorld(), { token: 'code1', finishOk: true });
    w.attempts.code1 = { invite_token: 'CIRCLETOK', live: false };   // the page already spent it
    const { handler, log } = load(w);
    const r = await call(handler, { finish: 'f'.repeat(32) });
    ck('D · the reply’s link still joins after the page spent the code',
       r.status === 200 && log.joined === 'c1' && log.spentCode === null, 'status ' + r.status + ', joined ' + log.joined);
  }
  {
    const w = Object.assign(baseWorld(), { token: 'code3' });
    w.attempts.code3 = { invite_token: 'CIRCLETOK', live: true };
    w.links.CIRCLETOK.active = false;                              // revoked since the code was minted
    const { handler, log } = load(w);
    const r = await call(handler, { token: 'code3', phone: w.phone });
    ck('E · an invitation revoked since is refused', r.status === 410 && log.joined === null && log.sessionFor === null,
       'status ' + r.status);
  }

  // ── 2 · THE REAL DATABASE ─────────────────────────────────────────────────
  const env = path.join(REPO, '.env.local');
  const m0 = fs.existsSync(env) ? read(env).match(/^TRUSTNET_DB_URL\s*=\s*(.+)$/m) : null;
  if (OLD) console.log('\n  (section 2 skipped under --old: the live database cannot be put back to before 0058)');
  else if (!m0) console.log('\n  (no TRUSTNET_DB_URL — section 2 skipped)');
  else {
    console.log('\n── 2 · the real database, as a signed-out visitor, rolled back ──\n');
    const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));
    const c = new Client({ connectionString: m0[1].trim(), ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query('begin');
    try {
      const link = (await c.query(`select token from public.circle_invite_links where active limit 1`)).rows[0].token;
      await c.query('set local role anon');
      const seen = (await c.query(`select count(*)::int n from public.invite_claims`)).rows[0].n;
      ck('the role is in force: a visitor reads nothing from invite_claims', seen === 0, String(seen));
      const code = (await c.query(`select public.mint_join_token($1) t`, [link])).rows[0].t;
      ck('a visitor holding a live invitation can mint a join code', /^[0-9a-f]{32}$/.test(code || ''), String(code));
      const none = (await c.query(`select public.mint_join_token('not-an-invitation') t`)).rows[0].t;
      ck('...and gets nothing for a token that is not one', none === null);
      await c.query('reset role');
      const raw = (await c.query(`select public.record_invite_claim($1, '+972500000001', null) r`, [link])).rows[0].r;
      ck('the shared invite token records NO claim', raw.ok === false, JSON.stringify(raw));
      const viaCode = (await c.query(`select public.record_invite_claim($1, '+972500000001', null) r`, [code])).rows[0].r;
      ck('the join code records one, for the circle, with its finish pass',
         viaCode.ok === true && viaCode.kind === 'invite' && !!viaCode.circle && !!viaCode.finish, JSON.stringify(viaCode));
      // The first draft of 0058 failed HERE: it read an unassigned record for
      // every plain sign-in. Caught by executing it in a rolled-back dry run.
      const signin = (await c.query(`select public.mint_signin_token() t`)).rows[0].t;
      const viaSignin = (await c.query(`select public.record_invite_claim($1, '+972500000002', null) r`, [signin])).rows[0].r;
      ck('a plain sign-in still records, as a sign-in with no circle',
         viaSignin.ok === true && viaSignin.kind === 'signin' && viaSignin.circle === null, JSON.stringify(viaSignin));
      await c.query('set local role anon');
      const byShared = (await c.query(`select public.claim_status($1) s`, [link])).rows[0].s;
      ck('holding only the shared token, a visitor learns NOTHING of that join', byShared.claimed === false, JSON.stringify(byShared));
      const byCode = (await c.query(`select public.claim_status($1) s`, [code])).rows[0].s;
      ck('the browser holding the code sees its own claim', byCode.claimed === true);
      await c.query('reset role');
      await c.query(`update public.circle_invite_links set active = false where token = $1`, [link]);
      const code2 = (await c.query(`select public.mint_join_token($1) t`, [link])).rows[0].t;
      ck('a revoked invitation mints no code', code2 === null);
    } finally { await c.query('rollback'); await c.end(); }
  }

  // ── 3 · THE REAL APP: the invite button sends the code ────────────────────
  console.log('\n── 3 · the invite button, in Chrome ──\n');
  let playwright = null;
  try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
  if (!playwright) console.log('  (no Playwright — section 3 skipped)');
  else {
    const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(() => { window.open = function (u) { window.__opened = String(u); return null; }; });
      await ctx.route('https://trustnetsocial.com/**', (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/' || u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX });
        return route.fulfill({ status: 404, body: '' });
      });
      await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
        const p = new URL(route.request().url()).pathname;
        const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
        if (p.endsWith('/rpc/invite_preview')) return json({ ok: true, inviter: 'Tal', circle: 'Puglia trip' });
        if (p.endsWith('/rpc/mint_join_token')) return json('code0123456789abcdef0123456789ab');
        if (p.endsWith('/rpc/claim_status')) return json({ claimed: false });
        if (p.indexOf('/rest/v1/rpc/') >= 0) return json(null);
        if (p.indexOf('/rest/v1/') >= 0) return json([]);
        return json({});
      });
      const page = await ctx.newPage();
      await page.goto('https://trustnetsocial.com/?join=SHAREDcircleTOKEN42');
      const btn = page.locator('[data-action="codeless-join"]');
      await btn.waitFor({ state: 'visible', timeout: 15000 });
      await btn.click();
      await page.waitForFunction(() => !!window.__opened, null, { timeout: 8000 }).catch(() => {});
      const opened = decodeURIComponent(String(await page.evaluate(() => window.__opened || '')));
      console.log('        WhatsApp would open with: ' + (opened.split('text=')[1] || '(nothing)'));
      ck('the invite button sends the one-off code', /Join Trustnet: code0123456789abcdef0123456789ab/.test(opened), opened);
      ck('...and never the shared invite token', opened.indexOf('SHAREDcircleTOKEN42') < 0, opened);
    } finally { await browser.close(); }
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — the baseline keys joins on the shared token, so the checks above measure the fix.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
