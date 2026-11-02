// typing-sim.js - Ask and Recommend on a phone with the keyboard up (v0.102.1).
// dan's iPhone, 2 Nov, on v0.102.0: "you have to tap inside the question for
// the toggle with the number of people you are sending to which is also the
// send button" - and in his screenshot that button sat on the question while
// he typed. Two causes, two fixes:
//
//   1. the app was 100vh tall. In Safari on an iPhone that is the screen with
//      Safari's bars HIDDEN, so the foot of every screen sat below what you
//      could see, and the send button - moved to the very bottom in step 3 -
//      sat in that strip. #app is now 100dvh, the height actually visible.
//   2. with the keyboard up, a button held at the foot of what is left covers
//      the field being typed in. While a field of the sheet has the cursor,
//      the button waits at the end of the form, and is held again a moment
//      after the cursor leaves.
//   And the sheet's fields ask iOS not to offer AutoFill (autocomplete=off);
//   whether iOS 26 then hides its key / card / pin bar is for a real phone.
//
// Chrome cannot draw Safari's bars, so (1) is checked in the stylesheet, as
// code with the comments taken out. (2) is drawn and USED: the keyboard is
// modelled as what it leaves - a screen 360px tall - and the cursor is put in
// the field for real.
//
//   node typing-sim.js        -> must PASS
//   node typing-sim.js --old  -> pre-v0.102.1/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-v0.102.1', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 300) : '')); }
};

function seed() {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: 'var(--circle-1)', bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._tmFetched = true; AppState._tmData = []; AppState._answered = []; AppState._feed = [];
  AppState.userCollections = []; AppState.people = []; AppState.circleInterests = []; AppState.suggestions = [];
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: 'var(--circle-1)', location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2', 'm3'] }];
  AppState.userMembers = ['Tom', 'May', 'Rany'].map(function (n, i) {
    return { id: 'm' + (i + 1), circleId: 'c1', name: n + ' Shapiro', avatar: n.charAt(0), avatarColor: 'var(--circle-' + (i + 2) + ')', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+97250000000' + i, responseRate: 'unknown', isExternalSource: false, linkedUserId: null };
  });
  AppState.userCanonicals = []; AppState.userRecs = []; AppState.userQueries = []; AppState._notifications = [];
}

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-v0.102.1/index.html  (must FAIL)' : 'web/index.html') + '\n');

  console.log('== 1. the app is the height you can see ==\n');
  const css = code(fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n'));
  const appRules = css.match(/#app\s*\{[^}]*\}/g) || [];
  ck('#app is 100dvh tall, the height actually visible', appRules.some((r) => /height:\s*100dvh/.test(r)), appRules.join(' | ').slice(0, 200));
  ck('...with 100vh before it, for a browser that cannot read dvh', appRules.some((r) => /height:\s*100vh/.test(r)) && css.indexOf('100vh') < css.indexOf('100dvh'));

  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const open = async (height, go) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: height }, isMobile: true, hasTouch: true });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      if (p === '/version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: (fs.readFileSync(INDEX, 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '' }) });
      const f = p === '/' || p === '/index.html' ? INDEX : path.join(REPO, 'web', p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: /\.html$/.test(f) ? 'text/html; charset=utf-8' : undefined, body: fs.readFileSync(f) });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: p.indexOf('/rest/v1/') === 0 && p.indexOf('/rpc/') < 0 ? '[]' : '{}' });
    });
    const page = await ctx.newPage();
    await page.goto('https://trustnetsocial.com/');
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((o) => {
      (0, eval)('(' + o.seed + ')')();
      document.getElementById('login').style.display = 'none';
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      (0, eval)(o.go);
    }, { seed: seed.toString(), go });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const overlap = (page, field) => page.evaluate((f) => {
    const s = document.getElementById('q-send'), t = document.getElementById(f);
    if (!s || !t) return null;
    const a = s.getBoundingClientRect(), b = t.getBoundingClientRect();
    return { covers: a.top < b.bottom && a.bottom > b.top && a.right > b.left && a.left < b.right, send: [Math.round(a.top), Math.round(a.bottom)], field: [Math.round(b.top), Math.round(b.bottom)],
      held: getComputedStyle(s).position, typing: document.getElementById('app').classList.contains('tn-typing') };
  }, field);

  try {
    console.log('\n== 2. typing with the keyboard up (what it leaves of the screen) ==\n');
    // The name box is shorter than the question box, so it needs less screen
    // left before a held button reaches it.
    for (const [label, mode, field, h] of [['Ask', 'ask', 'q-text', 360], ['Recommend', 'recommend', 'q-item-search', 320]]) {
      const { ctx, page } = await open(h, "AppState.queryMode='" + mode + "'; showView('query',{circleId:'c1'})");
      const before = await overlap(page, field);
      ck('[precondition] ' + label + ': on a screen this short, a held button WOULD cover the field', before && before.held === 'sticky' && before.covers, JSON.stringify(before));
      const el = await page.$('#' + field);
      if (el) await el.focus(); else ck(label + ': the field is there', false);
      await page.waitForTimeout(150);
      const typing = await overlap(page, field);
      ck(label + ': while you type, the send button does not cover the field', typing && !typing.covers, JSON.stringify(typing));
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(80);
      const soon = await overlap(page, field);
      // Both of these follow from the button having stepped back at all: on a
      // page where it never moves they would pass for nothing.
      ck(label + ': ...it does not move the instant the cursor leaves (a tap on it stays a tap on it)', typing && typing.held === 'static' && soon && soon.held === 'static', JSON.stringify(soon));
      await page.waitForTimeout(500);
      const after = await overlap(page, field);
      ck(label + ': ...and is held at the bottom again once you have stopped', typing && typing.held === 'static' && after && after.held === 'sticky' && !after.typing, JSON.stringify(after));
      await ctx.close();
    }

    console.log('\n== 3. no AutoFill offered on the sheet\'s fields ==\n');
    {
      const { ctx, page } = await open(844, "AppState.queryMode='recommend'; showView('query',{circleId:'c1'})");
      const A = await page.evaluate(() => ['q-text', 'q-item-search', 'q-new-loc', 'q-new-note'].map((id) => { const e = document.getElementById(id); return id + '=' + (e ? e.getAttribute('autocomplete') : 'missing'); }));
      ck('the question, the name, the place and the note all ask for no AutoFill', A.every((x) => /=off$/.test(x)), A.join(' '));
      await ctx.close();
    }
  } catch (e) {
    ck('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
  } finally {
    await browser.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
