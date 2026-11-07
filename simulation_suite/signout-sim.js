// ═══════════════════════════════════════════════════════════════════════════
// signout-sim — Sign out signs this device out, whatever the connection does
// (v0.104.1).
//
// FOUND 7 Nov 2026 by session-cookie-sim, failing on the live app with no
// change of ours: every page loaded supabase-js as "@2", i.e. the newest 2.x,
// and 2.119.0 (4 Nov) changed sign-out. With the default scope ('global') a
// server call that fails - offline, a 5xx - now KEEPS the session on the
// device and returns an error. handleClearData then reloaded, and the person
// was still signed in, with nothing said. 2.118.0 cleared the device anyway
// (that copy of the sim passed 15 of 15).
//
// The fix, which is Supabase's own advice for 2.119.0: sign out everywhere
// first, and if that returns an error, sign out with scope 'local', which
// clears the device BEFORE it tries the server. And every page that loads the
// library names ONE EXACT version, so a release can no longer change the app
// the day it comes out.
//
// IT RUNS THE REAL APP in Chrome with the REAL library the page names (from
// the CDN), the server stubbed three ways: answering, failing, and the
// connection dropping. Each in a browser of its own.
//
//   node signout-sim.js         live pages, must PASS
//   node signout-sim.js --old   pre-v0.104.1/, must FAIL (exit 1)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const PAGES = OLD ? path.join(__dirname, 'pre-v0.104.1') : path.join(REPO, 'web');
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
// What the page RUNS, not what its comments say: a comment may well quote the
// old "@2" it replaced.
const code = (t) => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

console.log('\n── signing out ── ' + (OLD ? 'BASELINE pre-v0.104.1/ (must FAIL)' : 'live pages') + ' ──\n');

// ── 0 · one exact version ──────────────────────────────────────────────────
console.log('── 0 · the library is pinned ──\n');
const versions = fs.readdirSync(PAGES).filter((f) => /\.html$/.test(f)).map((f) => {
  const m = code(read(path.join(PAGES, f))).match(/@supabase\/supabase-js@([^/"'\s]+)\//);
  return m ? [f, m[1]] : null;
}).filter(Boolean);
const exact = versions.every(([, v]) => /^\d+\.\d+\.\d+$/.test(v)), same = versions.every(([, v]) => v === (versions[0] || [])[1]);
ck('every page that loads supabase-js names one exact version, the same on all (' + versions.length + ' pages)',
   versions.length >= 3 && exact && same, versions.map(([f, v]) => f + '@' + v).join(', '));
const PINNED = versions.length ? versions[0][1] : '?';

// ── the server, stubbed ────────────────────────────────────────────────────
const users = {};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function mintSession() {
  const id = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const at = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: id, exp, iat: exp - 3600, role: 'authenticated', aud: 'authenticated' }) + '.c2ln';
  users[at] = { id, aud: 'authenticated', role: 'authenticated', email: 'maya@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: at, refresh_token: crypto.randomBytes(12).toString('hex') };
}

async function wire(ctx, logout, calls) {
  const version = (read(path.join(PAGES, 'index.html')).match(/const APP_VERSION = '([^']+)'/) || [])[1] || '';
  await ctx.route('https://trustnetsocial.com/**', (route) => {
    let p = new URL(route.request().url()).pathname;
    if (p === '/' || p === '/index.html') p = '/index.html';
    // An old page must be served a version.json that matches it, or it reloads
    // itself mid-run as out of date (the update check working as designed).
    if (p === '/version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version }) });
    const f = path.join(PAGES, p);
    if (p.endsWith('.html') && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(f) });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
    const req = route.request();
    const u = new URL(req.url()), p = u.pathname;
    const bearer = String(req.headers()['authorization'] || '').replace(/^Bearer /, '');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    if (p === '/auth/v1/user') return users[bearer] ? json(users[bearer]) : json({ msg: 'invalid' }, 401);
    if (p === '/auth/v1/logout') {
      calls.push(u.searchParams.get('scope') || 'global');
      if (logout === 'drop') return route.abort('internetdisconnected');
      return route.fulfill({ status: logout, headers: cors, body: '' });
    }
    if (p.indexOf('/rest/v1/users') === 0) return json(users[bearer] ? [{ id: users[bearer].id, name: 'Maya', email: 'maya@example.com', joined_date: '2026-10-10' }] : []);
    if (p.indexOf('/rest/v1/rpc/') === 0) return json(null);
    if (p.indexOf('/rest/v1/') === 0) return json([]);
    return json({});
  });
}
// A screen check must wait for the loading screen and require a real session
// (join-link-sim's first run reported "signed in" under the loading screen).
async function screen(page) {
  await page.waitForFunction(() => {
    const ls = document.getElementById('loading-screen');
    return !(ls && getComputedStyle(ls).display !== 'none' && ls.style.opacity !== '0');
  }, null, { timeout: 15000 }).catch(() => {});
  return page.evaluate(async () => {
    const s = (await sb.auth.getSession()).data.session;
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return vis('login') ? 'Sign in' : (vis('app') && s) ? 'signed in' : vis('onboarding') ? 'name screen' : 'loading';
  });
}
const cookieParts = async (ctx) => (await ctx.cookies()).filter((c) => c.name.indexOf(KEY + '.') === 0 || c.name === KEY).map((c) => c.name);

(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [label, logout] of [['the server answers', 204], ['the server fails (500)', 500], ['the connection drops', 'drop']]) {
      console.log('\n── Sign out, when ' + label + ' ──\n');
      const calls = [];
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await wire(ctx, logout, calls);
      const page = await ctx.newPage();
      await page.goto('https://trustnetsocial.com/');
      await screen(page);
      await page.evaluate(async (s) => { await sb.auth.setSession(s); }, mintSession());
      await page.reload();
      const before = await screen(page), parts = await cookieParts(ctx);
      ck('[precondition] signed in, with the sign-in in a cookie', before === 'signed in' && parts.length > 0, before + ' / ' + parts.join(', '));
      const lib = await page.evaluate(() => (document.querySelector('script[src*="supabase-js@"]') || {}).src || '');
      await page.evaluate(() => { window.confirm = () => true; });
      await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.evaluate(() => { handleClearData(); })]);
      const left = await cookieParts(ctx);
      ck(label + ': Sign out removes the sign-in from this device', left.length === 0, left.join(', ') + '  (' + lib.replace(/^.*supabase-js@/, '@').replace(/\/.*$/, '') + ')');
      ck('...and the page is back on Sign in', (await screen(page)) === 'Sign in');
      // A fix that only ever signed out locally would pass the two above and
      // stop signing the person out of their other devices.
      ck('...having first asked the server to sign out everywhere', calls[0] === 'global', JSON.stringify(calls));
      await ctx.close();
    }
  } catch (e) {
    fail++; console.log('  FAIL  threw: ' + (e && e.message || e).split('\n')[0]);
  } finally {
    await browser.close();
  }

  console.log('\n  library: supabase-js@' + PINNED);
  console.log('  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — before the fix, Sign out on a failing connection leaves the person signed in.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
