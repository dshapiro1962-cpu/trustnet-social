// sheets-sim.js - step 3 of 4 of the visual redesign (v0.102.0). dan, 2 Nov:
// "go with step 3":
//
//   - Ask and Recommend arrive as a SHEET that grows out of the button you
//     pressed; the bar at the bottom steps aside; a round x goes back to
//     wherever you were - Home, a circle - and the + menu's Recommend too
//   - the bar FOLDS to the one tab you are on while you scroll down a list,
//     opens again when you scroll up or tap it, and the + never folds
//   - Saved is one card of rows; an item wears its picture across the top
//     when it has one, its buttons as pills, and where it stands as ONE
//     switch with the true one lit - which moves when you press another
//
// Drawn and USED in Chrome at 390x844 against a stubbed Supabase. "Grows out
// of the button" is read off the animation itself: its first frame must be
// the button's own box.
//
//   node sheets-sim.js        -> must PASS
//   node sheets-sim.js --old  -> pre-step3/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-step3', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 300) : '')); }
};

function seed(many) {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  var col = function (c) { return typeof tnColour === 'function' ? tnColour(c) : c; };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: col('#1D5A45'), bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._tmFetched = true; AppState._tmData = []; AppState._answered = []; AppState._feed = [];
  AppState.userCollections = []; AppState.people = []; AppState.circleInterests = []; AppState.suggestions = [];
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: col('#1D5A45'), location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2'] }];
  AppState.userMembers = [
    { id: 'm1', circleId: 'c1', name: 'Tom Shapiro', avatar: 'TS', avatarColor: col('#3F6C8A'), trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000001', responseRate: 'unknown', isExternalSource: false, linkedUserId: 'u1' },
    { id: 'm2', circleId: 'c1', name: 'May Shapiro', avatar: 'MS', avatarColor: col('#7B5D98'), trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000003', responseRate: 'unknown', isExternalSource: false, linkedUserId: null }];
  AppState.userCanonicals = [
    { id: 'k1', type: 'place', name: 'Masseria Moroseta', category: 'hotel', kind: 'hotel', location: 'Ostuni, Puglia', description: '', imageEmoji: '', primaryCategory: 'travel', aiTags: [], imageUrl: 'https://trustnetsocial.com/film-thumb.png', hasSearchDoc: true },
    { id: 'k2', type: 'place', name: 'Arte', category: 'restaurant', kind: 'restaurant', location: 'Lecce', description: '', imageEmoji: '', primaryCategory: 'dining', aiTags: [], imageUrl: '', hasSearchDoc: true }];
  AppState.userRecs = [
    { id: 'r1', canonicalId: 'k1', circleId: 'c1', recommendedBy: 'm1', note: 'Book the room with the terrace.', rating: 0, tags: [], status: 'saved', date: iso(now - d), addedAt: iso(now - d), category: '' },
    { id: 'r2', canonicalId: 'k2', circleId: 'c1', recommendedBy: 'm2', note: '', rating: 0, tags: [], status: 'saved', date: iso(now - 2 * d), addedAt: iso(now - 2 * d), category: '' }];
  if (many) for (var i = 3; i < 34; i++) {
    AppState.userCanonicals.push({ id: 'k' + i, type: 'place', name: 'Place number ' + i, category: 'restaurant', kind: 'restaurant', location: 'Lecce', description: '', imageEmoji: '', primaryCategory: 'dining', aiTags: [], imageUrl: '', hasSearchDoc: true });
    AppState.userRecs.push({ id: 'r' + i, canonicalId: 'k' + i, circleId: 'c1', recommendedBy: 'm2', note: 'Worth the trip.', rating: 0, tags: [], status: 'saved', date: iso(now - i * d), addedAt: iso(now - i * d), category: '' });
  }
  AppState.userQueries = [];
  AppState._notifications = [];
}

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-step3/index.html  (must FAIL)' : 'web/index.html') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const open = async (go, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, isMobile: !opts.viewport, hasTouch: !opts.viewport, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
    const wire = [];
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      // The page checks /version.json and replaces itself when it is out of
      // date. Served the live file, an old page would reload in the middle of
      // the run and fail for that reason, not for what it draws.
      if (p === '/version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: (fs.readFileSync(INDEX, 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '' }) });
      const f = p === '/' || p === '/index.html' ? INDEX : path.join(REPO, 'web', p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: /\.html$/.test(f) ? 'text/html; charset=utf-8' : (/\.png$/.test(f) ? 'image/png' : undefined), body: fs.readFileSync(f) });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (req.method() !== 'GET') wire.push(req.method() + ' ' + p + ' ' + (req.postData() || ''));
      if (p === '/auth/v1/user') return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: p.indexOf('/rest/v1/') === 0 && p.indexOf('/rpc/') < 0 ? '[]' : '{}' });
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com/');
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((o) => {
      (0, eval)('(' + o.seed + ')')(o.many);
      // the app reloads from the database after some writes; keep what we drew
      window.loadUserData = function () { return Promise.resolve(); };
      document.getElementById('login').style.display = 'none';
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      (0, eval)(o.go);
    }, { seed: seed.toString(), many: !!opts.many, go });
    await page.waitForTimeout(400);
    return { ctx, page, errs, wire };
  };
  // Press a button and read the animation it starts, at once, before it ends.
  const pressAndRead = async (page, sel) => {
    const box = await page.evaluate((s) => { const b = document.querySelector(s); if (!b) return null; const r = b.getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return { top: r.top - m.top, left: r.left - m.left }; }, sel);
    if (!box) return { box: null };
    const anim = await page.evaluate((s) => {
      document.querySelector(s).click();
      const as = document.getElementById('main').getAnimations ? document.getElementById('main').getAnimations() : [];
      const clip = as.map((a) => a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []).filter((k) => k.length && k[0].clipPath)[0];
      return clip ? clip[0].clipPath : '';
    }, sel);
    return { box, anim };
  };
  // A tap on something that may not be there: on the old page it is not, and
  // that is a failure to record, not a reason to stop the run.
  const tap = async (page, sel) => {
    const el = await page.$(sel);
    if (!el) { ck('[can press] ' + sel, false, 'not on the screen'); return false; }
    await el.click();
    return true;
  };
  const state = (page) => page.evaluate(() => {
    const bar = document.getElementById('mobile-tabbar'), x = document.querySelector('#topbar-title [data-action="close-sheet"]');
    return { view: AppState.currentView, mode: AppState.queryMode, circle: (AppState.viewParams || {}).circleId || '',
      sheet: document.getElementById('app').classList.contains('tn-sheet-open'),
      barGone: parseFloat(getComputedStyle(bar).opacity) < 0.1 || bar.getBoundingClientRect().top >= innerHeight,
      x: !!x, xLabel: x ? x.getAttribute('aria-label') : '', title: (document.getElementById('topbar-title') || {}).innerText || '' };
  });

  try {
    console.log('== 1. Ask grows out of the button, as a sheet ==\n');
    {
      const { ctx, page, errs } = await open("showView('home')");
      const g = await pressAndRead(page, '.tn-verbs [data-mode="ask"]');
      const nums = String(g.anim || '').match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/);
      ck('pressing Ask starts the screen growing', !!g.anim, g.anim);
      ck('...from the button\'s own box', !!(nums && g.box && Math.abs(+nums[1] - g.box.top) < 3 && Math.abs(+nums[4] - g.box.left) < 3), g.anim + ' vs ' + JSON.stringify(g.box));
      await page.waitForTimeout(700);
      const S = await state(page);
      ck('Ask opens, as a sheet', S.view === 'query' && S.mode === 'ask' && S.sheet, JSON.stringify(S));
      ck('...the bar at the bottom steps aside', S.barGone, JSON.stringify(S));
      ck('...and a round x, labelled Close, beside its name', S.x && S.xLabel === 'Close' && /Ask/.test(S.title), JSON.stringify(S));
      await tap(page, '#topbar-title [data-action="close-sheet"]');
      await page.waitForTimeout(600);
      const B = await state(page);
      ck('the x goes back to Home, and the bar comes back', B.view === 'home' && !B.sheet && !B.barGone, JSON.stringify(B));
      if (errs.length) ck('no errors', false, errs.join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page } = await open("showView('circle-detail',{circleId:'c1'})");
      await tap(page, '.tn-pair [data-mode="ask"]');
      await page.waitForTimeout(700);
      const S = await state(page);
      ck('from a circle, Ask opens on that circle', S.view === 'query' && S.circle === 'c1' && S.sheet, JSON.stringify(S));
      await tap(page, '#topbar-title [data-action="close-sheet"]');
      await page.waitForTimeout(600);
      const B = await state(page);
      ck('...and the x goes back to that circle', B.view === 'circle-detail' && B.circle === 'c1', JSON.stringify(B));
      await ctx.close();
    }
    {
      const { ctx, page } = await open("showView('home')");
      await tap(page, '.mfab');
      await page.waitForTimeout(400);
      const g = await pressAndRead(page, '.modal [data-action="fab-recommend"]');
      await page.waitForTimeout(700);
      const S = await state(page);
      ck('the + menu\'s Recommend opens Recommend as a sheet', S.view === 'query' && S.mode === 'recommend' && S.sheet, JSON.stringify(S));
      ck('...growing out of the +', !!g.anim, g.anim);
      await tap(page, '#topbar-title [data-action="close-sheet"]');
      await page.waitForTimeout(600);
      ck('...and the x goes back to Home', (await state(page)).view === 'home');
      await ctx.close();
    }
    {
      const { ctx, page } = await open("showView('home')", { reduce: true });
      const g = await pressAndRead(page, '.tn-verbs [data-mode="ask"]');
      await page.waitForTimeout(300);
      const S = await state(page);
      ck('with reduced motion asked for, Ask opens without the grow', !g.anim && S.view === 'query', JSON.stringify({ anim: g.anim, view: S.view }));
      await ctx.close();
    }

    console.log('\n== 2. the bar folds while you scroll ==\n');
    {
      const { ctx, page } = await open("showView('library')", { many: true });
      const read = () => page.evaluate(() => { const bar = document.getElementById('mobile-tabbar'), r = bar.getBoundingClientRect(), fab = document.querySelector('.mfab').getBoundingClientRect();
        return { min: bar.classList.contains('tn-min'), w: r.width, shown: [].filter.call(bar.querySelectorAll('.mtab'), (t) => t.getBoundingClientRect().width > 4).map((t) => t.id),
          fabRight: fab.right, fabW: fab.width, view: AppState.currentView, top: document.getElementById('view-body').scrollTop }; });
      ck('[precondition] Saved is long enough to scroll', await page.evaluate(() => { const v = document.getElementById('view-body'); return v.scrollHeight > v.clientHeight + 600; }));
      const before = await read();
      for (let i = 1; i <= 6; i++) { await page.evaluate((y) => { const v = document.getElementById('view-body'); v.scrollTop = y; v.dispatchEvent(new Event('scroll')); }, i * 90); await page.waitForTimeout(60); }
      await page.waitForTimeout(600);
      const down = await read();
      ck('scrolling down folds the bar to the tab you are on', down.min && down.w <= 90 && JSON.stringify(down.shown) === '["mtab-library"]', JSON.stringify(down));
      ck('...and the + stays where it was, full size', Math.abs(down.fabRight - before.fabRight) < 2 && down.fabW >= 60, JSON.stringify({ before: before.fabRight, after: down.fabRight, w: down.fabW }));
      // Folded, the only tab showing is the one you are on, so a tap that
      // wrongly navigates lands on the same screen and LOOKS the same - which
      // is how this check first passed with its mechanism removed. It counts
      // redraws instead: opening the bar must not redraw the screen.
      await page.evaluate(() => { window.__renders = 0; var o = renderApp; renderApp = function () { window.__renders++; return o.apply(this, arguments); }; });
      await tap(page, '#mobile-tabbar');
      await page.waitForTimeout(600);
      const tapped = await read();
      const redrawn = await page.evaluate(() => window.__renders);
      ck('a tap on the folded bar opens it, and goes nowhere', down.min && !tapped.min && tapped.view === 'library' && tapped.shown.length === 4 && redrawn === 0, JSON.stringify({ wasFolded: down.min, redrawn, tapped }));
      for (let i = 1; i <= 4; i++) { await page.evaluate((y) => { const v = document.getElementById('view-body'); v.scrollTop = y; v.dispatchEvent(new Event('scroll')); }, 540 + i * 90); await page.waitForTimeout(60); }
      await page.waitForTimeout(300);
      const again = (await read()).min;
      ck('...scrolling down again folds it again', again);
      for (let i = 1; i <= 4; i++) { await page.evaluate((y) => { const v = document.getElementById('view-body'); v.scrollTop = y; v.dispatchEvent(new Event('scroll')); }, 900 - i * 100); await page.waitForTimeout(60); }
      await page.waitForTimeout(600);
      ck('...and scrolling up opens it', again && !(await read()).min);
      await ctx.close();
    }

    console.log('\n== 3. Saved and an item ==\n');
    {
      const { ctx, page } = await open("showView('library')");
      const L = await page.evaluate(() => { const l = document.querySelector('#view-body .tn-reclist'); if (!l) return null;
        const p = document.createElement('div'); p.style.background = 'var(--surface)'; document.body.appendChild(p); const want = getComputedStyle(p).backgroundColor; p.remove();
        return { bg: getComputedStyle(l).backgroundColor, want, radius: parseFloat(getComputedStyle(l).borderTopLeftRadius), rows: l.querySelectorAll('.tn-rec').length }; });
      ck('Saved is one card of rows', L && L.bg === L.want && L.radius >= 20 && L.rows === 2, JSON.stringify(L));
      await ctx.close();
    }
    {
      const { ctx, page } = await open("showView('rec-detail',{recId:'r1'})");
      const I = () => page.evaluate(() => ({
        hero: (function () { const h = document.querySelector('.tn-item-hero'); return h ? getComputedStyle(h).backgroundImage : ''; })(),
        headTile: !!document.querySelector('.tn-item-head .tn-tile'),
        sw: [].map.call(document.querySelectorAll('.tn-status [data-action="toggle-status"]'), (b) => b.innerText.trim() + '=' + b.getAttribute('aria-pressed')),
        recs: document.querySelectorAll('.tn-item-recs .tn-row').length,
        pills: [].map.call(document.querySelectorAll('.tn-item-acts .btn'), (b) => parseFloat(getComputedStyle(b).borderTopLeftRadius) >= 18) }));
      const A = await I();
      ck('an item with a picture wears it across the top', /film-thumb\.png/.test(A.hero) && !A.headTile, JSON.stringify(A));
      ck('where it stands is one switch, the true one lit', JSON.stringify(A.sw) === '["Mark visited=false","Save for later=true","Dismiss=false"]', JSON.stringify(A.sw));
      ck('its buttons are pills', A.pills.length >= 2 && A.pills.every(Boolean), JSON.stringify(A.pills));
      ck('its recommendations are rows on one card', A.recs === 1, A.recs);
      await tap(page, '.tn-status [data-status="visited"]');
      await page.waitForTimeout(600);
      const B = await I();
      ck('pressing Mark visited lights Mark visited', JSON.stringify(B.sw) === '["Mark visited=true","Save for later=false","Dismiss=false"]', JSON.stringify(B.sw));
      await ctx.close();
    }
    {
      const { ctx, page } = await open("showView('rec-detail',{recId:'r2'})");
      const C = await page.evaluate(() => ({ hero: !!document.querySelector('.tn-item-hero'), tile: (function () { const t = document.querySelector('.tn-item-head .tn-tile'); return t ? t.getBoundingClientRect().width : 0; })() }));
      ck('an item without a picture shows its kind\'s tile, large, beside its name', !C.hero && C.tile >= 60, JSON.stringify(C));
      await ctx.close();
    }

    console.log('\n== 4. on a computer ==\n');
    {
      const { ctx, page } = await open("showView('home')", { viewport: { width: 1280, height: 860 } });
      const g = await pressAndRead(page, '.tn-verbs [data-mode="ask"]');
      await page.waitForTimeout(400);
      const S = await page.evaluate(() => ({ view: AppState.currentView, bg: getComputedStyle(document.getElementById('view-body')).borderTopLeftRadius }));
      ck('on a computer Ask opens as a page, as before', !g.anim && S.view === 'query' && S.bg === '0px', JSON.stringify({ anim: g.anim, S }));
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
