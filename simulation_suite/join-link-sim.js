// ═══════════════════════════════════════════════════════════════════════════
// join-link-sim — screen 6. Does the link in Trustnet's WhatsApp reply get the
// person in, or send them round again?
//
// dan, 7 Oct 2026: "screen 6 is a problem people get confused with what they
// should do next and they use 'If that tab closed, open this instead' option
// and get into a loop".
//
// IN THE DATABASE (read 7 Oct): phone …4488 sent the Join message at 11:44:50
// and was signed in at 11:44:56; sent it AGAIN at 11:47:02 and was signed in
// again at 11:47:06. Six and four seconds is the waiting page, not a person.
// Phone …9911 did the same on 5 Oct.
//
// WHAT IS REAL HERE
//   - the app: web/index.html, unmodified, in Chrome via Playwright
//   - two browsers at once, each with ITS OWN STORAGE, which is the condition:
//     the page that is waiting, and wherever WhatsApp opens the link
//   - the WhatsApp reply, read from whatsapp-webhook's source
// WHAT IS A MODEL
//   - the server. There is no Deno here, and this must not touch production,
//     so complete-join, claim_status, mint_signin_token and record_invite_claim
//     are re-stated below from their source - and section 0 checks the source
//     still says what the model assumes, so the model cannot drift silently.
//
// MODES
//   node join-link-sim.js         the live files - the fix (v0.99.9 / 0056).
//                                 Must PASS.
//   node join-link-sim.js --old   the baselines the fix was made against:
//                                 index.pre-v0.99.9.html and fn-pre-0056/.
//                                 Must FAIL (exit 1) - that failure is the loop.
//
// THE FIX: the reply says "Tap to open Trustnet:" and its link carries a pass
// of its own (?finish=), minted with the claim. complete-join accepts it on its
// own, so either door can finish and neither can use up the other. A used or
// expired link says so instead of silently showing Sign in.
//
// Before the fix was built this ran the same scenarios against a PROPOSED
// patch of a copy (dan: "simulate to see if your fix works"): today's code
// failed 4, the proposal passed 10, and removing either the link's own pass or
// the message broke it. The model now follows whichever server source it is
// given, not a flag.
//
// Needs Chrome and network access for supabase-js from jsdelivr. Exit 2 if not.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
// A whole run takes about a minute and a half. Anything past six is a stall.
setTimeout(() => { console.log('\n  FATAL: the run stalled past six minutes\n'); process.exit(2); }, 360000).unref();
let playwright;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); }
catch (e) { console.log('\n  SKIP: Playwright not found in e2e/node_modules\n'); process.exit(2); }

// core.autocrlf is true on this machine.
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n');
// A STRUCTURAL ASSERTION MUST READ CODE, NOT THE COMMENTS ABOUT IT.
const code = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|--)/.test(l)).join('\n');

const INDEX = read(OLD ? 'simulation_suite/index.pre-v0.99.9.html' : 'web/index.html');
const WEBHOOK = code(read(OLD ? 'simulation_suite/fn-pre-0056/whatsapp-webhook.ts' : 'supabase/functions/whatsapp-webhook/index.ts'));
const COMPLETE = code(read(OLD ? 'simulation_suite/fn-pre-0056/complete-join.ts' : 'supabase/functions/complete-join/index.ts'));
const M0056 = OLD ? '' : code(read('migrations/0056_the_link_in_the_reply_works.sql'));
const CLAIMS_SQL = code(read('supabase/migrations/0033_invite_claims.sql'));
const SIGNIN_SQL = code(read('migrations/0052_signing_in_is_sending_a_message.sql'));

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};
const fatal = (m) => { console.log('\n  FATAL: ' + m + '\n'); process.exit(2); };

// ── 0 · THE MODEL MUST MATCH THE SOURCE ────────────────────────────────────
console.log('\n── 0 · the server model, checked against the source ──\n');
const src = [
  ['complete-join only takes an UNUSED claim',
    /from\("invite_claims"\)[\s\S]{0,200}\.is\("consumed_at", null\)/.test(COMPLETE)],
  ['...and uses it up when it signs someone in',
    /from\("invite_claims"\)\s*\.update\(\{ consumed_at:/.test(COMPLETE)],
  ['...and only for the phone that sent the message',
    /phoneKey\((claim|byToken)\.claimed_phone\) !== phoneKey\(phone\)/.test(COMPLETE)],
  ['claim_status sees only an unused, unexpired claim',
    /consumed_at is null and expires_at > now\(\)/.test(CLAIMS_SQL)],
  ['a claim lives ten minutes', /expires_at\s+timestamptz not null default now\(\) \+ interval '10 minutes'/.test(CLAIMS_SQL)],
  ['a sign-in claim needs a live sign-in token',
    /from public\.signin_tokens\s+where token = p_token and consumed_at is null and expires_at > now\(\)/.test(SIGNIN_SQL)],
  ...(OLD ? [
    ['the reply links to ?claimed=<token>', /"\/\?claimed=" \+ token/.test(WEBHOOK)],
  ] : [
    ['the reply links to ?finish=<its own pass>', /"\/\?finish=" \+ rec\.finish/.test(WEBHOOK)],
    ['0056 mints that pass with the claim and returns it',
      /insert into public\.invite_claims \(token, claimed_phone, claimed_name, finish_secret\)/.test(M0056)
      && /'finish', v_finish/.test(M0056)],
    ['complete-join spends the pass in the statement that finds it',
      /\.update\(\{ finish_used_at:[\s\S]{0,120}\.eq\("finish_secret", finish\)\.is\("finish_used_at", null\)\s*\.gt\("expires_at"/.test(COMPLETE)],
    ['...and only the waiting page\u2019s door spends the claim',
      /if \(!finish\) \{\s*const \{ error: claimErr2 \} = await admin\.from\("invite_claims"\)\s*\.update\(\{ consumed_at:/.test(COMPLETE)],
    ['...and the reply\u2019s door needs the sign-in token to exist, not to be unspent',
      // Since 0058 the code's row is read once for both doors; only the
      // waiting page's door then requires it to be live.
      /from\("signin_tokens"\)\.select\("token, invite_token"\)\.eq\("token", token\)[\s\S]{0,200}if \(!attempt\) return err\("invite_no_longer_valid", 410\);[\s\S]{0,300}if \(!finish\) \{\s*const \{ data: live/.test(COMPLETE)],
  ]),
  ['the waiting page asks every 2 seconds',
    /TN_JOIN_POLL = setTimeout\(function \(\) \{ pollForClaim\(token, attempt \+ 1\); \}, 2000\)/.test(INDEX)],
];
src.forEach(([n, c]) => { if (!c) fatal('the source no longer says: ' + n + ' - the model below would be wrong'); console.log('  ok    ' + n); });

// The reply exactly as the webhook writes it, lifted from its source.
const HAS_FINISH = /finish_secret/.test(COMPLETE);
const replyText = (() => {
  if (!OLD) {
    const m = WEBHOOK.match(/await sendText\(from, ("Tap to open Trustnet:[^"]*") \+ appUrl \+ "\/\?finish=" \+ rec\.finish\)/);
    if (!m) fatal('could not lift the reply text from whatsapp-webhook');
    // eslint-disable-next-line no-new-func
    const lead = new Function('return ' + m[1])();
    return (c) => lead + 'https://trustnetsocial.com/?finish=' + c.finish;
  }
  const m = WEBHOOK.match(/await sendText\(from,\s*\n?\s*("Got it[\s\S]*?)\+ appUrl \+ "\/\?claimed=" \+ token\)/);
  if (!m) fatal('could not lift the reply text from whatsapp-webhook');
  // eslint-disable-next-line no-new-func
  const lead = new Function('return ' + m[1].trim().replace(/\+\s*$/, ''))();
  return (c) => lead + 'https://trustnetsocial.com/?claimed=' + c.token;
})();

// ── THE SERVER MODEL ───────────────────────────────────────────────────────
// Each rule below is one of the source checks above.
function makeServer() {
  const S = { skew: 0, tokens: new Map(), claims: [], users: new Map(), sessions: new Map(), lastToken: null };
  const now = () => Date.now() + S.skew;
  const rnd = () => crypto.randomBytes(16).toString('hex');
  S.mint = () => { const t = rnd(); S.tokens.set(t, { consumed: null, expires: now() + 600000 }); S.lastToken = t; return t; };
  const liveToken = (t) => { const x = S.tokens.get(t); return !!x && !x.consumed && x.expires > now(); };
  // record_invite_claim, sign-in branch (0052)
  S.record = (token, phone) => {
    if (!liveToken(token)) return null;
    S.claims = S.claims.filter((c) => !(c.token === token && !c.consumed));
    const c = { token, phone, at: now(), consumed: null, expires: now() + 600000,
      finish: HAS_FINISH ? rnd() : null, finishUsed: null };
    S.claims.push(c);
    return c;
  };
  const liveClaim = (token) => S.claims.filter((c) => c.token === token && !c.consumed && c.expires > now()).pop();
  S.claimStatus = (token) => { const c = liveClaim(token); return c ? { claimed: true, phone: c.phone } : { claimed: false }; };
  const userFor = (phone) => {
    if (!S.users.has(phone)) S.users.set(phone, { id: crypto.randomUUID(), phone, email: phone.replace(/\D/g, '') + '@wa.trustnet', name: 'Maya' });
    return S.users.get(phone);
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const session = (u, door) => {
    const exp = Math.floor(now() / 1000) + 3600;
    const at = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: u.id, email: u.email, exp, iat: exp - 3600,
      role: 'authenticated', aud: 'authenticated', session_id: rnd() }) + '.c2lnbmF0dXJlc2ln';
    S.sessions.set(at, { user: u, door, at: now() });
    return { access_token: at, refresh_token: rnd(), is_new: false, circle: null };
  };
  // complete-join
  S.complete = (body) => {
    if (HAS_FINISH && body.finish) {
      // The reply's door: its own pass, bound to the claim (the proof that this
      // phone sent the message), never to the waiting page's half of it.
      const c = S.claims.find((x) => x.finish === body.finish);
      if (!c || c.finishUsed || c.expires <= now()) return [410, { error: 'finish_used_or_expired' }];
      c.finishUsed = now();
      if (!S.tokens.has(c.token)) return [410, { error: 'invite_no_longer_valid' }];
      return [200, session(userFor(c.phone), 'link')];
    }
    const c = liveClaim(String(body.token || ''));
    if (!c) return [404, { error: 'no_live_claim' }];
    if (String(c.phone).replace(/\D/g, '').slice(-9) !== String(body.phone || '').replace(/\D/g, '').slice(-9)) return [403, { error: 'phone_mismatch' }];
    if (!liveToken(c.token)) return [410, { error: 'invite_no_longer_valid' }];
    c.consumed = now();
    S.tokens.get(c.token).consumed = now();
    return [200, session(userFor(c.phone), 'waiting page')];
  };
  S.userForBearer = (h) => { const s = S.sessions.get(String(h || '').replace(/^Bearer /, '')); return s ? s.user : null; };
  return S;
}

const PAGE = INDEX;

// ── THE BROWSERS ───────────────────────────────────────────────────────────
const APP = 'https://trustnetsocial.com';
const SUPA = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co';
const PHONE = '+972541234488';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Bounded: the first --old run on 7 Oct sat for an hour on an unbounded wait here.
const minted = async (S) => {
  const end = Date.now() + 15000;
  while (!S.lastToken) { if (Date.now() > end) fatal('no sign-in token was minted within 15s'); await sleep(100); }
};

async function wire(ctx, S) {
  await ctx.route('https://wa.me/**', (r) => r.abort());
  await ctx.route(APP + '/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/version.json') return route.fulfill({ status: 404, body: '' });
    if (u.pathname === '/' || u.pathname === '/index.html') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
    }
    const f = path.join(REPO, 'web', decodeURIComponent(u.pathname));
    if (f.startsWith(path.join(REPO, 'web')) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ path: f });
    return route.fulfill({ status: 404, body: '' });
  });
  await ctx.route(SUPA + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const body = (() => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } })();
    const json = (status, o) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = u.pathname;
    if (p === '/rest/v1/rpc/mint_signin_token') return json(200, S.mint());
    if (p === '/rest/v1/rpc/claim_status') return json(200, S.claimStatus(body.p_token));
    if (p === '/functions/v1/complete-join') { const [st, o] = S.complete(body); return json(st, o); }
    if (p === '/auth/v1/user') {
      const user = S.userForBearer(req.headers()['authorization']);
      return user ? json(200, { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
        phone: user.phone, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
        : json(401, { msg: 'invalid' });
    }
    if (p.indexOf('/rest/v1/users') === 0) {
      const user = S.userForBearer(req.headers()['authorization']);
      return json(200, user ? [{ id: user.id, name: user.name, email: user.email, phone: user.phone,
        avatar: 'M', avatar_color: '#1D5A45', joined_date: '2026-10-07' }] : []);
    }
    if (p.indexOf('/rest/v1/rpc/') === 0) return json(200, null);
    if (p.indexOf('/rest/v1/') === 0) return json(200, []);
    if (p.indexOf('/auth/v1/') === 0) return json(200, {});
    return json(200, {});
  });
}

// #app is visible from the start, UNDER the loading screen - the first run of
// this sim read that as "signed in" while the page was still deciding. So the
// loading screen must be gone, and "signed in" needs a real session too.
async function look(page) {
  return page.evaluate(async () => {
    const s = (await sb.auth.getSession()).data.session;
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    const ls = document.getElementById('loading-screen');
    const loading = !!ls && getComputedStyle(ls).display !== 'none' && ls.style.opacity !== '0';
    const err = document.getElementById('login-err');
    return { signedIn: !!s,
      screen: loading ? 'loading' : vis('login') ? 'Sign in' : vis('onboarding') ? 'name screen'
        : (vis('app') && s) ? 'Trustnet (signed in)' : 'loading',
      message: err && getComputedStyle(err).display !== 'none' ? err.textContent : '' };
  });
}
async function waitForScreen(page, want, ms) {
  const end = Date.now() + ms;
  let st = null;
  while (Date.now() < end) {
    try { st = await look(page); if (st.screen === want) return st; } catch (e) {}
    await sleep(250);
  }
  return st || { screen: 'loading', signedIn: false, message: '' };
}
// Wherever WhatsApp opens a link: its own browser, with its own storage.
async function linkBrowser(browser, S) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await wire(ctx, S);
  return ctx;
}
const claimOf = (S, token) => S.claims.filter((x) => x.token === token).pop();
const replyOf = (S, token) => replyText(claimOf(S, token));
const linkOf = (S, token) => replyOf(S, token).split('\n').pop();

// One round: press Continue with WhatsApp on `page`, send the message, read
// the reply for a few seconds, tap its link. Returns the page the link opened.
async function round(n, page, openLink, S, t0, log) {
  await waitForScreen(page, 'Sign in', 15000);
  await page.click('#login-wa-go');
  const end = Date.now() + 10000;
  while (!S.lastToken && Date.now() < end) await sleep(100);
  const token = S.lastToken; S.lastToken = null;
  await sleep(2500);                                   // WhatsApp opens; they press send
  S.record(token, PHONE);
  log(n, t0, 'presses send in WhatsApp');
  const reply = replyOf(S, token);
  await sleep(6000);                                   // reads the reply, taps the link
  log(n, t0, 'reads the reply:  "' + reply.replace(/\n+/g, ' / ') + '"');
  log(n, t0, 'taps the link');
  const landed = await openLink(linkOf(S, token));
  const st = await waitForScreen(landed, 'Trustnet (signed in)', 8000);
  log(n, t0, 'the link opens on:  ' + st.screen + (st.message ? '  — "' + st.message + '"' : '  (no message)'));
  return { landed, st, token };
}

(async () => {
  console.log('\n── ' + (OLD ? 'BASELINE, before the fix (must FAIL)' : 'LIVE FILES')
    + ' ── the real app, two browsers, a model server ──');
  let browser;
  try { browser = await playwright.chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { fatal('could not start Chrome: ' + e.message.split('\n')[0]); }
  const log = (n, t0, s) => console.log('   round ' + n + '  +' + String(Math.round((Date.now() - t0) / 1000)).padStart(2) + 's  ' + s);

  // ── 1 · THE LOOP: waiting page alive, link opens in another browser ──────
  console.log('\n── 1 · the waiting page is still open; WhatsApp opens the link in another browser ──\n');
  {
    const S = makeServer();
    const startCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await wire(startCtx, S);
    const waiting = await startCtx.newPage();
    await waiting.goto(APP + '/');
    const linkCtx = await linkBrowser(browser, S);
    const t0 = Date.now();
    let page = waiting, rounds = 0, inside = false, first = null, firstWaiting = null;
    while (rounds < 3 && !inside) {
      rounds++;
      const r = await round(rounds, page, async (url) => { const p = await linkCtx.newPage(); await p.goto(url); return p; }, S, t0, log);
      if (rounds === 1) { first = r.st; firstWaiting = await look(waiting); }
      inside = r.st.signedIn;
      page = r.landed;                                // they carry on from where they are looking
    }
    const sent = rounds;
    console.log('\n   the page they started on, after round 1:  ' + firstWaiting.screen
      + (firstWaiting.signedIn ? '  (signed in there - where they are not looking)' : ''));
    console.log('   messages they had to send:  ' + sent + '     sign-ins created:  ' + S.sessions.size + '\n');
    ck('the link gets them in the first time', first.signedIn === true,
       'it showed "' + first.screen + '"' + (first.message ? '' : ' with no message'));
    ck('one message is enough', sent === 1, sent + ' messages, as phone … 4488 sent on 6 Oct');
    ck('the page they started on also ends up signed in', firstWaiting.signedIn === true);
    await startCtx.close(); await linkCtx.close();
  }

  // ── 2 · THE WAITING PAGE CLOSED: the reason the link exists ──────────────
  console.log('\n── 2 · the phone closed the waiting page while they were in WhatsApp ──\n');
  {
    const S = makeServer();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await wire(ctx, S);
    const waiting = await ctx.newPage();
    await waiting.goto(APP + '/');
    const linkCtx = await linkBrowser(browser, S);
    const t0 = Date.now();
    await waitForScreen(waiting, 'Sign in', 15000);
    await waiting.click('#login-wa-go');
    await minted(S);
    const token = S.lastToken;
    await waiting.close();                            // the phone discards it
    log(1, t0, 'the waiting page is closed by the phone');
    await sleep(1500); S.record(token, PHONE); log(1, t0, 'presses send in WhatsApp');
    await sleep(3000); log(1, t0, 'taps the link');
    const p = await linkCtx.newPage(); await p.goto(linkOf(S, token));
    const st = await waitForScreen(p, 'Trustnet (signed in)', 8000);
    log(1, t0, 'the link opens on:  ' + st.screen);
    ck('with the waiting page gone, the link still gets them in', st.signedIn === true);
    await ctx.close(); await linkCtx.close();
  }

  // ── 3 · SAME BROWSER: WhatsApp opens the link where they started ────────
  console.log('\n── 3 · WhatsApp opens the link in the same browser they started in ──\n');
  {
    const S = makeServer();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await wire(ctx, S);
    const waiting = await ctx.newPage();
    await waiting.goto(APP + '/');
    const r = await round(1, waiting, async (url) => { const p = await ctx.newPage(); await p.goto(url); return p; }, S, Date.now(), log);
    ck('in the same browser the link gets them in', r.st.signedIn === true);
    await ctx.close();
  }

  // ── 4 · A USED LINK, AND AN EXPIRED ONE ──────────────────────────────────
  console.log('\n── 4 · the same link opened again, and a link opened after ten minutes ──\n');
  {
    const S = makeServer();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await wire(ctx, S);
    const p0 = await ctx.newPage();
    await p0.goto(APP + '/');
    await waitForScreen(p0, 'Sign in', 15000);
    await p0.click('#login-wa-go');
    await minted(S);
    const token = S.lastToken;
    await p0.close();
    S.record(token, PHONE);
    const link = linkOf(S, token);
    const a = await linkBrowser(browser, S); const pa = await a.newPage(); await pa.goto(link);
    const first = await waitForScreen(pa, 'Trustnet (signed in)', 8000);
    const b = await linkBrowser(browser, S); const pb = await b.newPage(); await pb.goto(link);
    const again = await waitForScreen(pb, 'Trustnet (signed in)', 6000);
    console.log('   first open:   ' + first.screen);
    console.log('   opened again in another browser:  ' + again.screen + (again.message ? '  — "' + again.message + '"' : '  (no message)'));
    ck('a link works once', first.signedIn === true);
    ck('...and a second browser opening it is NOT let in', again.signedIn === false,
       'a forwarded link would sign someone else in');
    ck('...and is told why, not dropped silently on Sign in', !!again.message, 'no message on screen');
    // Ten minutes on: a fresh message, its link opened too late.
    const p1 = await ctx.newPage(); await p1.goto(APP + '/');
    await waitForScreen(p1, 'Sign in', 15000);
    S.lastToken = null; await p1.click('#login-wa-go');
    await minted(S);
    const t2 = S.lastToken; await p1.close();
    S.record(t2, PHONE);
    S.skew += 11 * 60000;
    const c = await linkBrowser(browser, S); const pc = await c.newPage(); await pc.goto(linkOf(S, t2));
    const late = await waitForScreen(pc, 'Trustnet (signed in)', 6000);
    console.log('   opened after 11 minutes:  ' + late.screen + (late.message ? '  — "' + late.message + '"' : '  (no message)'));
    ck('an expired link does not let anyone in', late.signedIn === false);
    ck('...and says so', !!late.message, 'no message on screen');
    for (const x of [ctx, a, b, c]) await x.close();
  }

  // ── 5 · THE RISK, SHOWN RATHER THAN HIDDEN ───────────────────────────────
  console.log('\n── 5 · the accepted risk: the reply forwarded before they tap it ──\n');
  {
    const S = makeServer();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await wire(ctx, S);
    const p0 = await ctx.newPage(); await p0.goto(APP + '/');
    await waitForScreen(p0, 'Sign in', 15000);
    await p0.click('#login-wa-go');
    await minted(S);
    const token = S.lastToken;
    S.record(token, PHONE);
    await sleep(4000);                               // the waiting page signs them in
    const other = await linkBrowser(browser, S); const po = await other.newPage(); await po.goto(linkOf(S, token));
    const st = await waitForScreen(po, 'Trustnet (signed in)', 8000);
    console.log('   someone else opens the forwarded link within ten minutes:  ' + st.screen);
    console.log('   ' + (st.signedIn
      ? 'THEY GET IN. This is the cost of the fix, the same as an email sign-in link.'
      : 'they do not get in.'));
    await ctx.close(); await other.close();
  }

  await browser.close();
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK \u2014 the baseline loops, so the checks above measure the fix.\n'
      : '  CONTROL BROKEN \u2014 the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
