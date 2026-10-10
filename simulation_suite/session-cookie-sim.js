// ═══════════════════════════════════════════════════════════════════════════
// session-cookie-sim — the sign-in lives in a cookie, so an icon added to the
// home screen opens signed in (v0.99.11).
//
// MEASURED FIRST, on dan's iPhone (Chrome and Safari) and an Android, 10 Oct
// 2026, with web/hs-test: an icon on the home screen sees the browser's
// COOKIES, never its saved data (localStorage). supabase-js keeps the session
// in localStorage by default, so every iPhone icon asked for a second sign-in.
//
// THE ICON IS MODELLED EXACTLY AS THE PHONE SHOWED IT: a second browser that
// is given the first one's cookies and none of its localStorage.
//
// IT RUNS THE REAL PAGES - index, respond, connect, confirm - in Chrome, with
// the server stubbed. And it checks the five copies of the store are one text.
//
//   node session-cookie-sim.js         live pages, must PASS
//   node session-cookie-sim.js --old   pre-cookie-session/, must FAIL (exit 1)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const PAGES = OLD ? path.join(__dirname, 'pre-cookie-session') : path.join(REPO, 'web');
const KEY = 'sb-kgsdtfrcyjrxeyqqxoic-auth-token';
let playwright;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); }
catch (e) { console.log('\n  SKIP: Playwright not found\n'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ── 0 · ONE STORE, FIVE COPIES ──────────────────────────────────────────────
console.log('\n── the sign-in in a cookie ── ' + (OLD ? 'BASELINE, before (must FAIL)' : 'live pages') + ' ──\n');
{
  const block = (f) => {
    const s = read(path.join(PAGES, f));
    const a = s.indexOf('// ── TN SESSION STORE'); const b = s.indexOf('// ── END TN SESSION STORE');
    return a < 0 || b < 0 ? null : s.slice(a, b);
  };
  const copies = ['index.html', 'respond.html', 'collection.html', 'connect.html', 'confirm.html'].map((f) => [f, block(f)]);
  ck('every page that reads the sign-in carries the store', copies.every(([, b]) => !!b),
     copies.filter(([, b]) => !b).map(([f]) => f).join(', '));
  ck('...and all five copies are the same text', copies.every(([, b]) => b && b === copies[0][1]));
}

// ── the server, stubbed ────────────────────────────────────────────────────
const users = {};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mintSession() {
  const id = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const at = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: id, exp, iat: exp - 3600, role: 'authenticated', aud: 'authenticated' }) + '.c2ln';
  // Big enough to need more than one cookie part, so the split is exercised.
  users[at] = { id, aud: 'authenticated', role: 'authenticated', email: 'maya@example.com', app_metadata: {},
    user_metadata: { note: 'x'.repeat(4200) }, created_at: new Date().toISOString() };
  return { access_token: at, refresh_token: crypto.randomBytes(12).toString('hex') };
}
const seen = { confirmAuth: null };
let logoutStatus = 500;   // sign-out must clear the cookie even when the server call fails

async function wire(ctx) {
  await ctx.route('https://trustnetsocial.com/**', (route) => {
    const u = new URL(route.request().url());
    let p = u.pathname;
    if (p === '/' || p === '/index.html') p = '/index.html';
    else if (p === '/connect') p = '/connect.html';
    else if (p === '/confirm') p = '/confirm.html';
    const f = path.join(PAGES, p);
    if (p.endsWith('.html') && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(f) });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const bearer = String(req.headers()['authorization'] || '').replace(/^Bearer /, '');
    const json = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p === '/auth/v1/user') return users[bearer] ? json(users[bearer]) : json({ msg: 'invalid' }, 401);
    if (p === '/auth/v1/logout') return route.fulfill({ status: logoutStatus, body: '' });
    // confirm sends the PUBLIC key to view a draft, by design, and the member's
    // sign-in only when they act on it - so the press is what is checked.
    if (p === '/functions/v1/connector-confirm') {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      if (body.action === 'send') { seen.confirmAuth = bearer; return json({ sent: true, reached: ['Tal'], circle: 'Puglia trip' }); }
      return json({ state: 'ready', circle: 'Puglia trip', count: 1, recipients: ['Tal'], text: 'Where should we eat?' });
    }
    if (p.indexOf('/rest/v1/users') === 0) return json(users[bearer] ? [{ id: users[bearer].id, name: 'Maya', email: 'maya@example.com', joined_date: '2026-10-10' }] : []);
    if (p.indexOf('/rest/v1/rpc/') === 0) return json(null);
    if (p.indexOf('/rest/v1/') === 0) return json([]);
    return json({});
  });
}
async function screen(page) {
  try {
    await page.waitForFunction(() => {
      const ls = document.getElementById('loading-screen');
      return !(ls && getComputedStyle(ls).display !== 'none' && ls.style.opacity !== '0');
    }, null, { timeout: 15000 });
  } catch (e) {}
  return page.evaluate(async () => {
    const s = (await sb.auth.getSession()).data.session;
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return vis('login') ? 'Sign in' : (vis('app') && s) ? 'signed in' : vis('onboarding') ? 'name screen' : 'loading';
  });
}
const cookieParts = async (ctx) => (await ctx.cookies()).filter((c) => c.name.indexOf(KEY + '.') === 0).map((c) => c.name);

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const fresh = async (state) => { const c = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, state ? { storageState: state } : {})); await wire(c); return c; };
  try {
    // ── 1 · sign in, in the browser ─────────────────────────────────────────
    console.log('\n── 1 · signing in, in the browser ──\n');
    const A = await fresh();
    const pa = await A.newPage();
    await pa.goto('https://trustnetsocial.com/');
    await screen(pa);
    const sess = mintSession();
    await pa.evaluate(async (s) => { await sb.auth.setSession(s); }, sess);
    await pa.reload();
    ck('after sign-in and a reload, the browser is signed in', (await screen(pa)) === 'signed in');
    const parts = await cookieParts(A);
    ck('the sign-in is in a cookie', parts.length > 0, 'no cookie parts');
    ck('...split into parts when it is long', parts.length >= 2, parts.join(', '));
    const inLocal = await pa.evaluate((k) => localStorage.getItem(k), KEY);
    ck('...and NOT also in saved data (two copies would drift)', inLocal === null);

    // ── 2 · the icon: the cookies, and nothing else ─────────────────────────
    console.log('\n── 2 · the home-screen icon: cookies yes, saved data no (as on the iPhone) ──\n');
    const st = await A.storageState();
    const icon = await fresh({ cookies: st.cookies, origins: [] });
    const pi = await icon.newPage();
    await pi.goto('https://trustnetsocial.com/');
    const iconScreen = await screen(pi);
    ck('the icon opens SIGNED IN', iconScreen === 'signed in', 'it showed ' + iconScreen);
    const pr = await icon.newPage();
    await pr.goto('https://trustnetsocial.com/respond.html?t=x');
    const rs = await pr.evaluate(() => (typeof readTnSession === 'function' ? readTnSession() : null));
    ck('the answer page finds the sign-in there too', !!(rs && rs.token && rs.uid), JSON.stringify(rs));
    const pc = await icon.newPage();
    await pc.goto('https://trustnetsocial.com/connect');
    // "Signed in as you." is the markup's DEFAULT text, so matching those words
    // passed on the old page while it was signed out. The signed-in section
    // must be the one shown, and it must name the account.
    await pc.waitForFunction(() => {
      const o = document.getElementById('offer'), s = document.getElementById('signedout');
      return (o && !o.classList.contains('hidden')) || (s && !s.classList.contains('hidden'));
    }, null, { timeout: 10000 }).catch(() => {});
    const conn = await pc.evaluate(() => ({
      offer: !document.getElementById('offer').classList.contains('hidden'),
      who: (document.getElementById('who') || {}).textContent || '' }));
    ck('the connect page finds it', conn.offer && /maya@example\.com/.test(conn.who), JSON.stringify(conn));
    const pf = await icon.newPage();
    seen.confirmAuth = null;
    await pf.goto('https://trustnetsocial.com/confirm?d=draft');
    await pf.locator('#send').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await pf.locator('#send').click().catch(() => {});
    await pf.waitForTimeout(1500);
    ck('the confirm page sends it when the member presses Send', !!seen.confirmAuth && !!users[seen.confirmAuth],
       String(seen.confirmAuth).slice(0, 20));

    // ── 3 · a sign-in saved before this version ──────────────────────────────
    console.log('\n── 3 · someone signed in before the change ──\n');
    const old = mintSession();
    const userForOld = Object.values(users).slice(-1)[0];
    const oldValue = JSON.stringify({ access_token: old.access_token, refresh_token: old.refresh_token, token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userForOld });
    const C = await fresh();
    await C.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, oldValue]);
    const pcc = await C.newPage();
    await pcc.goto('https://trustnetsocial.com/');
    ck('they are still signed in after the change', (await screen(pcc)) === 'signed in');
    ck('...their sign-in moved into the cookie', (await cookieParts(C)).length > 0);
    ck('...and left no copy in saved data', (await pcc.evaluate((k) => localStorage.getItem(k), KEY)) === null);

    // ── 4 · signing out ─────────────────────────────────────────────────────
    console.log('\n── 4 · signing out, with the server call failing ──\n');
    await pa.evaluate(() => { window.confirm = () => true; });
    await Promise.all([pa.waitForNavigation({ timeout: 15000 }).catch(() => {}), pa.evaluate(() => { handleClearData(); })]);
    ck('signing out removes the cookie, even when the server call fails', (await cookieParts(A)).length === 0, (await cookieParts(A)).join(', '));
    ck('...and the page is back on Sign in', (await screen(pa)) === 'Sign in');
  } catch (e) {
    fail++; console.log('  FAIL  threw: ' + (e && e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — before the change the icon is signed out, so the checks above measure it.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
