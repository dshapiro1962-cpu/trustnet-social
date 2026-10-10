// ═══════════════════════════════════════════════════════════════════════════
// personal-invite-sim — the invited person's three steps (0059 / v0.99.12).
//
// dan, 10 Oct 2026: "eg gets invite link on WhatsApp taps link gets the sign
// in screen where you fill your name and location tap sign in then gets screen
// with put trustnet on your home screen creat circle and add memebers" - and
// "the user does not have to do anything beyond the 3 steps", iPhone and
// Android alike.
//
//   1  the REAL redeem-invite, in a vm (Node 24 strips the TypeScript). It is
//      new code, so "before" does not exist: its control is SABOTAGE - three
//      of its safeguards removed in turn, each of which must be caught
//   2  the REAL database, rolled back (needs 0059; skipped under --old)
//   3  the REAL app in Chrome: the invited person's three steps, the Invite
//      button on a member, Invite someone new, and a signed-in person
//      opening their link. Control: index.pre-v0.99.12.html
//
//   node personal-invite-sim.js         live, must PASS
//   node personal-invite-sim.js --old   the baseline app, must FAIL (exit 1)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { stripTypeScriptTypes } = require('module');

const OLD = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const INDEX = read(OLD ? path.join(__dirname, 'index.pre-v0.99.12.html') : path.join(REPO, 'web', 'index.html'));
const REDEEM_FILE = path.join(REPO, 'supabase', 'functions', 'redeem-invite', 'index.ts');

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

// ── 1 · redeem-invite ───────────────────────────────────────────────────────
function loadRedeem(src, world) {
  const log = { created: [], profiles: [], deleted: [], redeemedFor: null, sessionFor: null };
  const builder = (table) => {
    let op = 'select', payload = null; const filters = [];
    const resolve = () => {
      if (table === 'personal_invites') {
        const t = (filters.find((f) => f[0] === 'eq' && f[1][0] === 'token') || [, []])[1][1];
        return { data: world.invites[t] ? Object.assign({ token: t }, world.invites[t]) : null, error: null };
      }
      if (table === 'users' && op === 'insert') { log.profiles.push(payload); return { data: null, error: null }; }
      return { data: null, error: null };
    };
    const p = new Proxy({}, { get(_, k) {
      if (k === 'then') return (res) => res(resolve());
      if (k === 'maybeSingle' || k === 'single') return async () => resolve();
      return (...a) => { if (/^(insert|update|upsert|delete)$/.test(String(k))) { op = String(k); payload = a[0]; } filters.push([String(k), a]); return p; };
    } });
    return p;
  };
  const admin = {
    from: (t) => builder(t),
    rpc: async (name, args) => {
      if (name === 'redeem_personal_invite') { log.redeemedFor = args.p_user_id; return { data: world.redeem, error: null }; }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        createUser: async ({ email }) => { const id = 'u' + log.created.length; log.created.push({ id, email }); return { data: { user: { id, email } }, error: null }; },
        deleteUser: async (id) => { log.deleted.push(id); return { error: null }; },
        generateLink: async ({ email }) => { log.sessionFor = email; return { data: { properties: { hashed_token: 'h' } }, error: null }; },
      },
      verifyOtp: async () => ({ data: { session: { access_token: 'a', refresh_token: 'r' } }, error: null }),
    },
  };
  let handler = null;
  vm.runInNewContext(stripTypeScriptTypes(src.replace(/^import [^\n]*\n/gm, '')), {
    console: { log() {}, error() {}, warn() {} }, crypto: globalThis.crypto,
    Deno: { serve: (h) => { handler = h; }, env: { get: () => undefined } },
    Request, Response, JSON, Date, String,
    adminClient: () => admin,
    json: (b, s) => new Response(JSON.stringify(b), { status: s || 200 }),
    err: (m, s) => new Response(JSON.stringify({ error: m }), { status: s || 400 }),
    handleOptions: () => null,
  }, { filename: 'redeem-invite.ts' });
  return { handler, log };
}
async function redeemCases(src, label) {
  const results = {};
  const TOK = 'a'.repeat(32);
  const future = new Date(Date.now() + 86400000).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  const run = async (invites, body, redeem) => {
    const { handler, log } = loadRedeem(src, { invites, redeem: redeem || { ok: true, circle: 'Puglia trip' } });
    const r = await handler(new Request('https://x/functions/v1/redeem-invite', { method: 'POST', body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json().catch(() => ({})), log };
  };
  const live = { [TOK]: { used_at: null, expires_at: future } };
  const A = await run(live, { token: TOK, name: 'Maya', location: 'Tel Aviv' });
  results.A_ok = A.status === 200 && A.log.created.length === 1 && A.body.access_token === 'a';
  results.A_profile = A.log.profiles.length === 1 && A.log.profiles[0].name === 'Maya' && A.log.profiles[0].location === 'Tel Aviv';
  results.A_nophone = A.log.profiles.length === 1 && !('phone' in A.log.profiles[0]);
  results.A_linked = A.log.redeemedFor === (A.log.created[0] || {}).id && A.log.sessionFor === (A.log.created[0] || {}).email;
  const B = await run({ [TOK]: { used_at: past, expires_at: future } }, { token: TOK, name: 'Maya' });
  const C = await run({ [TOK]: { used_at: null, expires_at: past } }, { token: TOK, name: 'Maya' });
  const D = await run({}, { token: TOK, name: 'Maya' });
  results.dead_refused = [B, C, D].every((x) => x.status === 410 && x.log.created.length === 0);
  const E = await run(live, { token: TOK, name: '  ' });
  results.name_required = E.status === 400 && E.log.created.length === 0;
  const F = await run(live, { token: TOK, name: 'Maya' }, { ok: false, reason: 'used' });
  results.undo = F.status === 410 && F.log.created.length === 1 && F.log.deleted[0] === F.log.created[0].id;
  const G = await run(live, { token: 'nope', name: 'Maya' });
  results.bad_token = G.status === 400 && G.log.created.length === 0;
  return results;
}

(async () => {
  console.log('\n── 1 · redeem-invite, the real file ──\n');
  const redeemSrc = fs.existsSync(REDEEM_FILE) ? read(REDEEM_FILE) : null;
  if (!redeemSrc || OLD) {
    console.log('  (' + (OLD ? 'section 1 is the same under --old: the function is new, its control is the sabotage below' : 'no redeem-invite') + ')');
  }
  if (redeemSrc) {
    const r = await redeemCases(redeemSrc);
    ck('a live link + a name makes ONE account and signs it in', r.A_ok);
    ck('...with the name and location they typed', r.A_profile);
    ck('...and NO phone number (the inviter typed it; the person never proved it)', r.A_nophone);
    ck('...and links THAT account to the person, and signs THAT account in', r.A_linked);
    ck('a used, expired or unknown link makes no account at all', r.dead_refused);
    ck('no name, no account', r.name_required);
    ck('if the link is taken at the last moment, the new account is removed again', r.undo);
    ck('a malformed link makes no account', r.bad_token);

    console.log('\n  sabotage - each safeguard removed in turn must be caught:');
    const sabotages = [
      ['the live-link check is skipped', (s) => s.replace('if (!inv || inv.used_at || new Date(inv.expires_at) <= new Date()) {', 'if (false) {'), 'dead_refused'],
      ['the account is not removed on failure', (s) => s.replace('const { error: dErr } = await admin.auth.admin.deleteUser(userId);', 'const dErr = null;'), 'undo'],
      ['the typed phone is written onto the account', (s) => s.replace('id: userId, email, name, location: location || null,', 'id: userId, email, name, location: location || null, phone: "+972500000000",'), 'A_nophone'],
    ];
    for (const [what, mutate, guard] of sabotages) {
      const m = mutate(redeemSrc);
      if (m === redeemSrc) { ck('sabotage "' + what + '" applies to the source', false, 'anchor not found - the sabotage has decayed'); continue; }
      const r2 = await redeemCases(m);
      ck('sabotage "' + what + '" is caught', r2[guard] === false);
    }
  }

  // ── 2 · the database ──────────────────────────────────────────────────────
  const env = path.join(REPO, '.env.local');
  const m0 = fs.existsSync(env) ? read(env).match(/^TRUSTNET_DB_URL\s*=\s*(.+)$/m) : null;
  if (OLD) console.log('\n  (section 2 skipped under --old: the database cannot be put back to before 0059)');
  else if (!m0) console.log('\n  (no TRUSTNET_DB_URL — section 2 skipped)');
  else {
    console.log('\n── 2 · the real database, rolled back ──\n');
    const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));
    const c = new Client({ connectionString: m0[1].trim(), ssl: { rejectUnauthorized: false } });
    await c.connect();
    const asUser = async (uid) => { await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)", [uid]); };
    await c.query('begin');
    try {
      const has = (await c.query(`select count(*)::int n from pg_tables where schemaname='public' and tablename='personal_invites'`)).rows[0].n;
      ck('0059 is applied', has === 1, 'apply migrations/0059 first');
      const m = (await c.query(`select m.id, m.owner_id, c.name circle from public.members m join public.circles c on c.id = m.circle_id
        where coalesce(m.is_external_source,false) = false and m.linked_user_id is null and m.person_id is not null limit 1`)).rows[0];
      const other = (await c.query(`select id from public.users where id <> $1 limit 1`, [m.owner_id])).rows[0].id;
      const tok = crypto.randomBytes(16).toString('hex');
      await asUser(other);
      ck('the role is in force: nothing in personal_invites is readable', (await c.query('select count(*)::int n from public.personal_invites')).rows[0].n === 0);
      ck('a stranger cannot register a link for someone else’s member', (await c.query('select public.create_personal_invite($1,$2) t', [m.id, tok])).rows[0].t === null);
      await c.query('reset role');
      await asUser(m.owner_id);
      ck('the inviter registers the link their app made', (await c.query('select public.create_personal_invite($1,$2) t', [m.id, tok])).rows[0].t === tok);
      await c.query('reset role');
      await c.query('set local role anon');
      const pv = (await c.query('select public.personal_invite_preview($1) p', [tok])).rows[0].p;
      ck('the invited person’s page sees who asked and the circle, nothing more',
         pv.ok === true && pv.circle === m.circle && Object.keys(pv).sort().join(',') === 'circle,inviter,ok', JSON.stringify(pv));
      await c.query('reset role');
      await asUser(other);
      const acc = (await c.query('select public.accept_personal_invite($1) r', [tok])).rows[0].r;
      ck('opened by a signed-in person, it links them', acc.ok === true, JSON.stringify(acc));
      ck('...and cannot be used again', (await c.query('select public.accept_personal_invite($1) r', [tok])).rows[0].r.reason === 'used');
      await c.query('reset role');
    } finally { await c.query('rollback'); await c.end(); }
  }

  // ── 3 · the app ───────────────────────────────────────────────────────────
  console.log('\n── 3 · the app in Chrome ── ' + (OLD ? 'BASELINE v0.99.11 (must FAIL)' : 'live') + ' ──\n');
  let playwright = null;
  try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
  if (!playwright) { console.log('  (no Playwright — section 3 skipped)'); }
  else {
    const OWNER = '11111111-1111-4111-8111-111111111111';
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const sessions = {};
    const mint = (id, email) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const at = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: id, exp, iat: exp - 3600, role: 'authenticated', aud: 'authenticated' }) + '.c2ln';
      sessions[at] = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      return { access_token: at, refresh_token: crypto.randomBytes(8).toString('hex') };
    };
    const S = { members: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', circle_id: 'cccccccc-0000-4000-8000-000000000001', owner_id: OWNER, name: 'Tal',
      contact_method: 'whatsapp', contact_value: '+972541112222', linked_user_id: null, created_at: '2026-10-01T00:00:00Z' }],
      registered: [], accepted: [], redeemed: [] };
    const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
    const newCtx = async (state) => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, state ? { storageState: state } : {}));
      await ctx.addInitScript(() => { window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; }; });
      await ctx.route('https://trustnetsocial.com/**', (route) => {
        const p = new URL(route.request().url()).pathname;
        if (p === '/' || p === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX });
        return route.fulfill({ status: 404, body: '' });
      });
      await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', async (route) => {
        const req = route.request();
        const p = new URL(req.url()).pathname;
        const bearer = String(req.headers()['authorization'] || '').replace(/^Bearer /, '');
        const me = sessions[bearer];
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
        const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (p === '/auth/v1/user') return me ? json(me) : json({ msg: 'invalid' }, 401);
        if (p === '/rest/v1/rpc/personal_invite_preview') return json({ ok: true, inviter: 'Tal', circle: 'Puglia trip' });
        if (p === '/rest/v1/rpc/create_personal_invite') { S.registered.push(body); return json(body.p_token); }
        if (p === '/rest/v1/rpc/accept_personal_invite') { S.accepted.push(body.p_token); return json({ ok: true, circle: 'Puglia trip' }); }
        // The circle's SHARED link, which the baseline sends. Without this the
        // baseline sent nothing at all and b and c failed for the wrong reason.
        if (p === '/rest/v1/rpc/get_or_create_circle_link') return json('SHAREDcircleTOKEN42');
        if (p === '/rest/v1/rpc/resolve_contacts') return json([]);
        if (p === '/rest/v1/rpc/link_member') return json({ linked: false });
        if (p === '/functions/v1/redeem-invite') { S.redeemed.push(body); const s = mint(crypto.randomUUID(), 'inv@invite.trustnet.local'); return json(Object.assign({ circle: 'Puglia trip' }, s)); }
        if (p.indexOf('/rest/v1/users') === 0) return json(me ? [{ id: me.id, name: me.id === OWNER ? 'Dan' : 'Maya', email: me.email, joined_date: '2026-10-01' }] : []);
        if (p.indexOf('/rest/v1/circles') === 0) {
          if (req.method() === 'GET') return json(me && me.id === OWNER ? [{ id: 'cccccccc-0000-4000-8000-000000000001', owner_id: OWNER, name: 'Puglia trip', domain: 'travel', created_at: '2026-10-01T00:00:00Z' }] : []);
          return json([], 201);
        }
        if (p.indexOf('/rest/v1/members') === 0) {
          if (req.method() === 'GET') return json(me && me.id === OWNER ? S.members : []);
          (Array.isArray(body) ? body : [body]).forEach((row) => { if (!S.members.some((m) => m.id === row.id)) S.members.push(row); });
          return json([], 201);
        }
        if (p.indexOf('/rest/v1/rpc/') === 0) return json(null);
        if (p.indexOf('/rest/v1/') === 0) return json([]);
        return json({});
      });
      return ctx;
    };
    const settle = async (page) => { try { await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !(ls && getComputedStyle(ls).display !== 'none' && ls.style.opacity !== '0'); }, null, { timeout: 15000 }); } catch (e) {} };
    const signedIn = (page) => page.evaluate(async () => { const s = (await sb.auth.getSession()).data.session; const a = document.getElementById('app'); return !!s && !!a && getComputedStyle(a).display !== 'none'; });
    const HEX = /\/i\/[0-9a-f]{32}\b/;
    try {
      // a · the invited person: tap the link, name and location, Sign in
      const A = await newCtx();
      const pa = await A.newPage();
      await pa.goto('https://trustnetsocial.com/?invite=' + 'b'.repeat(32));
      await settle(pa);
      await pa.waitForTimeout(800);
      const ui = await pa.evaluate(() => {
        const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
        const btns = Array.prototype.slice.call(document.querySelectorAll('#login button')).filter(vis).map((b) => b.textContent.trim());
        return { name: vis(document.getElementById('pi-name')), loc: vis(document.getElementById('pi-location')), buttons: btns,
          head: ((document.querySelector('#login-invite .tn-inv-h') || {}).textContent || '') };
      });
      ck('a · the invited person sees who asked: "' + ui.head + '"', /Tal is inviting you to their Puglia trip circle/.test(ui.head));
      ck('a · ...a name, a location and ONE button, Sign in', ui.name && ui.loc && ui.buttons.length === 1 && ui.buttons[0] === 'Sign in', JSON.stringify(ui.buttons));
      if (ui.name) {
        await pa.fill('#pi-name', 'Maya Levi');
        await pa.fill('#pi-location', 'Tel Aviv');
        await pa.click('[data-action="personal-invite-signin"]');
        await pa.waitForTimeout(2500);
      }
      const red = S.redeemed[0] || {};
      ck('a · Sign in sends the link, the name and the location', red.token === 'b'.repeat(32) && red.name === 'Maya Levi' && red.location === 'Tel Aviv', JSON.stringify(red));
      ck('a · ...and they are IN, with nothing else to do', await signedIn(pa).catch(() => false));
      ck('a · ...WhatsApp never opened', (await pa.evaluate(() => window.__opened.length)) === 0);
      const icon = await newCtx({ cookies: (await A.storageState()).cookies, origins: [] });
      const pi = await icon.newPage();
      await pi.goto('https://trustnetsocial.com/');
      await settle(pi);
      ck('a · the home-screen icon opens signed in too', await signedIn(pi).catch(() => false));

      // b · the inviter presses Invite on a member
      const O = await newCtx();
      const po = await O.newPage();
      await po.goto('https://trustnetsocial.com/');
      await settle(po);
      await po.evaluate(async (s) => { await sb.auth.setSession(s); }, mint(OWNER, 'dan@example.com'));
      await po.reload(); await settle(po);
      await po.evaluate(async () => {
        const b = document.createElement('button');
        b.dataset.memberId = 'aaaaaaaa-0000-4000-8000-000000000001'; b.dataset.circleId = 'cccccccc-0000-4000-8000-000000000001'; b.dataset.circleName = 'Puglia trip';
        await handleInviteMember(b);
      });
      const sentB = decodeURIComponent((await po.evaluate(() => window.__opened.slice(-1)[0] || '')));
      const tokB = (sentB.match(/\/i\/([0-9a-f]{32})/) || [])[1];
      ck('b · Invite sends that person’s OWN link', HEX.test(sentB) && sentB.indexOf('/j/') < 0, sentB.slice(-60));
      ck('b · ...registered for that member, with the same code', S.registered.some((r) => r.p_member_id === 'aaaaaaaa-0000-4000-8000-000000000001' && r.p_token === tokB));

      // c · the inviter invites someone new
      await po.evaluate(() => { openInviteFresh({ circleId: 'cccccccc-0000-4000-8000-000000000001', circleName: 'Puglia trip' }); });
      await po.waitForSelector('#inv-contact', { timeout: 8000 }).catch(() => {});
      const before = S.registered.length;
      await po.evaluate(async () => {
        document.getElementById('inv-name').value = 'Noa';
        document.getElementById('inv-country').value = 'IL';
        document.getElementById('inv-contact').value = '54 333 4444';
        const btn = document.querySelector('[data-action="invite-new"]');
        await handleInviteNew(btn);
      });
      await po.waitForTimeout(1500);
      const sentC = decodeURIComponent((await po.evaluate(() => window.__opened.slice(-1)[0] || '')));
      const tokC = (sentC.match(/\/i\/([0-9a-f]{32})/) || [])[1];
      const noa = S.members.find((m) => m.name === 'Noa');
      ck('c · inviting someone new sends their OWN link', HEX.test(sentC) && sentC.indexOf('/j/') < 0, sentC.slice(-60));
      ck('c · ...and once their row is saved, the link is registered for it',
         !!noa && S.registered.slice(before).some((r) => r.p_member_id === noa.id && r.p_token === tokC),
         JSON.stringify(S.registered.slice(before)));

      // d · someone already signed in opens their link
      const D = await newCtx();
      const pd = await D.newPage();
      await pd.goto('https://trustnetsocial.com/');
      await settle(pd);
      await pd.evaluate(async (s) => { await sb.auth.setSession(s); }, mint(crypto.randomUUID(), 'already@example.com'));
      await pd.goto('https://trustnetsocial.com/?invite=' + 'd'.repeat(32));
      await settle(pd); await pd.waitForTimeout(1200);
      ck('d · a signed-in person opening their link is simply added', S.accepted.indexOf('d'.repeat(32)) > -1);
    } catch (e) {
      fail++; console.log('  FAIL  section 3 threw: ' + (e && e.message || e).split('\n')[0]);
    } finally { await browser.close(); }
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — the baseline app sends the shared link and asks for WhatsApp, so the checks above measure the change.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
