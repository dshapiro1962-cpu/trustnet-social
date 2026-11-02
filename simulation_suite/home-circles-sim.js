// home-circles-sim.js - step 2 of 4 of the visual redesign (v0.101.0). dan,
// 2 Nov: "go with step 2" - Home and circles:
//
//   - every circle is a DISC in its own colour, its name under it, with a New
//     disc at the end; on Home they sit on the colour band, and tapping one
//     opens that circle. The Circles screen and a circle's own page use the
//     same disc, in the same colour.
//   - the waiting card leads with WHO (face, name, when), then the question
//     itself, large; Answer and Answer from Saved do what they did
//   - "From your circles" is a row per thing, led by a tile that says what
//     KIND of thing it is: a drawing in that kind's colour (a restaurant is
//     food, whatever the word), its first letter for a word of your own
//   - the first visit's film is a real frame of the film, the width of the
//     screen, with the play button and its words on it
//
// Drawn in Chrome at 390x844 against a stubbed Supabase, by day and by night,
// and used: discs are tapped, the New disc opens New circle.
//
//   node home-circles-sim.js        -> must PASS
//   node home-circles-sim.js --old  -> pre-step2/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-step2', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 300) : '')); }
};

function seed(kind) {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  var col = function (c) { return typeof tnColour === 'function' ? tnColour(c) : c; };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: col('#1D5A45'), bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._tmFetched = true; AppState._tmData = []; AppState._answered = [];
  AppState._feed = [
    { canonical_id: 'kf1', recommender_name: 'May Shapiro', can_name: 'Trattoria Nonna Nietta', can_category: 'restaurant', can_location: 'Ostuni', note: 'Order whatever the nonna is cooking.' },
    { canonical_id: 'kf2', recommender_name: 'Rany Levi', can_name: 'Demon Copperhead', can_category: 'book', can_location: '', note: '' },
    { canonical_id: 'k1', recommender_name: 'Tal Shapiro', can_name: 'Masseria Moroseta', can_category: 'hotel', can_location: 'Ostuni', note: '' },
    { canonical_id: 'kf3', recommender_name: 'Tom Shapiro', can_name: 'Shabbat at Noa’s', can_category: 'shabbat dinner', can_location: '', note: '' }];
  AppState.userCollections = []; AppState.people = []; AppState.circleInterests = [];
  AppState.userCircles = [
    { id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: col('#1D5A45'), location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2'] },
    { id: 'c2', ownerId: 'me', name: 'Italy trip', domain: 'travel', description: '', color: col('#C0392B'), location: '', isOwn: true, createdAt: iso(now - 80 * d), memberIds: [] }];
  AppState.userMembers = [
    { id: 'm1', circleId: 'c1', name: 'Tom Shapiro', avatar: 'TS', avatarColor: col('#3F6C8A'), trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000001', responseRate: 'unknown', isExternalSource: false, linkedUserId: 'u1' },
    { id: 'm2', circleId: 'c1', name: 'May Shapiro', avatar: 'MS', avatarColor: col('#7B5D98'), trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000003', responseRate: 'unknown', isExternalSource: false, linkedUserId: null }];
  AppState.userCanonicals = [
    { id: 'k1', type: 'place', name: 'Masseria Moroseta', category: '', kind: 'hotel', location: 'Ostuni, Puglia', description: '', imageEmoji: '', primaryCategory: 'travel', aiTags: [], imageUrl: '', hasSearchDoc: true },
    { id: 'k2', type: 'place', name: 'Arte', category: '', kind: 'restaurant', location: 'Lecce', description: '', imageEmoji: '', primaryCategory: 'dining', aiTags: [], imageUrl: '', hasSearchDoc: true }];
  AppState.userRecs = [
    { id: 'r1', canonicalId: 'k1', circleId: 'c1', recommendedBy: 'm1', note: 'Book the room with the terrace.', rating: 0, tags: [], status: 'saved', date: iso(now - d), addedAt: iso(now - d), category: '' },
    { id: 'r2', canonicalId: 'k2', circleId: 'c1', recommendedBy: 'm2', note: '', rating: 0, tags: [], status: 'saved', date: iso(now - 2 * d), addedAt: iso(now - 2 * d), category: '' }];
  AppState.userQueries = [];
  AppState._notifications = [{ id: 'n1', type: 'query', title: 'Tom is asking', body: 'Where do we eat in Lecce on a Sunday?', circle_id: null, actor_name: 'Tom', created_at: iso(now - d / 2), response_token: 'tok1', query_id: null, link_url: null, handled_at: null }];
  AppState.suggestions = [];
  if (kind === 'none') { AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = []; AppState.userCanonicals = []; AppState._notifications = []; AppState._feed = []; }
}

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-step2/index.html  (must FAIL)' : 'web/index.html') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const draw = async (scheme, kind, go, fn) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: scheme });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      // The page checks /version.json and replaces itself when it is out of
      // date. Served the live file, an old page would reload in the middle of
      // the run and fail for that reason, not for what it draws.
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
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com/');
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((o) => {
      (0, eval)('(' + o.seed + ')')(o.kind);
      document.getElementById('login').style.display = 'none';
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      (0, eval)(o.go);
    }, { seed: seed.toString(), kind, go });
    await page.waitForTimeout(500);
    const r = await fn(page);
    await ctx.close();
    return { r, errs };
  };
  // The colour a token stands for, as the page resolves it.
  const tokenIn = "function tok(n) { var p = document.createElement('div'); p.style.background = 'var(' + n + ')'; document.body.appendChild(p); var v = getComputedStyle(p).backgroundColor; p.remove(); return v; }";

  try {
    for (const scheme of ['light', 'dark']) {
      const when = scheme === 'light' ? 'day' : 'night';
      console.log('\n== Home (' + when + ') ==\n');
      const H = await draw(scheme, 'full', "showView('home')", (page) => page.evaluate((T) => {
        (0, eval)(T);
        const resolve = (el) => { const p = document.createElement('div'); p.style.background = getComputedStyle(el).getPropertyValue('--cc'); document.body.appendChild(p); const v = getComputedStyle(p).backgroundColor; p.remove(); return v; };
        const discs = [].map.call(document.querySelectorAll('.tn-band .tn-disc-b[data-circle-id]'), (b) => {
          const d = b.querySelector('.tn-disc'), r = d ? d.getBoundingClientRect() : null;
          return { id: b.dataset.circleId, name: (b.querySelector('.tn-disc-n') || {}).innerText || '', w: r && r.width, h: r && r.height,
            round: d ? getComputedStyle(d).borderRadius : '', colour: d ? resolve(d) : '' };
        });
        const nu = document.querySelector('.tn-band .tn-disc-b[data-modal="add-circle"]');
        const wait = document.querySelector('.tn-wcard');
        const head = wait && wait.querySelector('.tn-wait-h'), q = wait && wait.querySelector('.tn-wait-q');
        const feed = [].map.call(document.querySelectorAll('.tn-feed .tn-fe'), (row) => {
          const t = row.firstElementChild;
          return { tileFirst: !!(t && t.classList.contains('tn-tile')), icon: !!(t && t.querySelector('svg')), letter: t ? t.innerText.trim() : '',
            bg: t ? getComputedStyle(t).backgroundColor : '', name: (row.querySelector('.tn-t1') || {}).innerText || '', facts: (row.querySelector('.tn-t2') || {}).innerText || '',
            save: !!row.querySelector('[data-action="save-from-feed"]'), saved: /Saved/.test(row.innerText) };
        });
        return { discs, c1: tok('--circle-1'), c2: tok('--circle-2'), food: tok('--tile-1'), stay: tok('--tile-2'), book: tok('--tile-5'),
          nu: !!nu, waitHead: head && head.querySelector('.tn-row-b') ? head.querySelector('.tn-row-b').innerText.replace(/\s+/g, ' ') : '', headFace: !!(head && head.querySelector('.tn-av')),
          q: q ? q.innerText : '', qSize: q ? parseFloat(getComputedStyle(q).fontSize) : 0, qWeight: q ? parseInt(getComputedStyle(q).fontWeight, 10) : 0,
          qAfterHead: !!(head && q && (head.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING)),
          answer: wait && wait.querySelector('a.tn-bigbtn') ? wait.querySelector('a.tn-bigbtn').getAttribute('href') : '',
          fromSaved: wait && wait.querySelector('[data-action="answer-lib"]') ? wait.querySelector('[data-action="answer-lib"]').innerText.trim() : '',
          feed, wide: document.scrollingElement.scrollWidth };
      }, tokenIn));
      const R = H.r;
      ck('every circle is a disc on the band, in the order they were made', JSON.stringify(R.discs.map((d) => d.id)) === '["c1","c2"]', JSON.stringify(R.discs.map((d) => d.id)));
      ck('...round, and big enough to tap', R.discs.length && R.discs.every((d) => d.w >= 56 && Math.abs(d.w - d.h) < 1 && d.round === '50%'), JSON.stringify(R.discs.map((d) => [d.w, d.h, d.round])));
      ck('...each in its own colour, an old stored colour landing on its slot', R.discs.length === 2 && R.discs[0].colour === R.c1 && R.discs[1].colour === R.c2, JSON.stringify(R.discs.map((d) => d.colour)) + ' want ' + R.c1 + ', ' + R.c2);
      ck('...with its name under it', R.discs.map((d) => d.name).join('|') === 'Travel|Italy trip', R.discs.map((d) => d.name).join('|'));
      ck('...and a New disc at the end', R.nu);
      ck('the waiting card leads with who, beside their face', /^Tom is waiting for your answer asked/.test(R.waitHead) && R.headFace, R.waitHead);
      ck('...then the question itself, large', /Where do we eat in Lecce on a Sunday\?/.test(R.q) && R.qSize >= 18 && R.qWeight >= 700 && R.qAfterHead, R.q + ' ' + R.qSize + 'px ' + R.qWeight);
      ck('...and Answer still opens the answer page with its pass', R.answer === 'respond.html?t=tok1', R.answer);
      ck('...and Answer from Saved is still there', R.fromSaved === 'Answer from Saved', R.fromSaved);
      ck('"From your circles" is a row per thing, each led by its tile', R.feed.length === 4 && R.feed.every((f) => f.tileFirst), JSON.stringify(R.feed.map((f) => f.tileFirst)));
      ck('...the thing named first, then where and who', R.feed.length && R.feed[0].name === 'Trattoria Nonna Nietta' && R.feed[0].facts === 'restaurant · Ostuni · from May', R.feed[0] && R.feed[0].facts);
      ck('...a restaurant drawn as food, in food\'s colour', R.feed[0] && R.feed[0].icon && R.feed[0].bg === R.food, R.feed[0] && (R.feed[0].bg + ' want ' + R.food));
      ck('...a hotel as a stay, a book as a book', R.feed[2] && R.feed[2].icon && R.feed[2].bg === R.stay && R.feed[1] && R.feed[1].icon && R.feed[1].bg === R.book, R.feed.map((f) => f.bg).join(' '));
      ck('...a word of your own keeps its first letter', R.feed[3] && !R.feed[3].icon && R.feed[3].letter === 'S', R.feed[3] && JSON.stringify(R.feed[3]));
      ck('...Save where it is not yet saved, a tick where it is', R.feed.length === 4 && R.feed[0].save && R.feed[2].saved && !R.feed[2].save, JSON.stringify(R.feed.map((f) => [f.save, f.saved])));
      ck('nothing on Home is wider than the phone', R.wide <= 390, R.wide);
      if (H.errs.length) ck('Home draws without an error', false, H.errs.join(' | '));
    }

    console.log('\n== using the discs ==\n');
    const tap = await draw('light', 'full', "showView('home')", async (page) => {
      const out = {};
      const d = await page.$('.tn-disc-b[data-circle-id="c2"]');
      if (d) { await d.click(); await page.waitForTimeout(300); }
      out.after = await page.evaluate(() => ({ view: AppState.currentView, id: (AppState.viewParams || {}).circleId }));
      await page.evaluate(() => showView('home'));
      await page.waitForTimeout(300);
      const n = await page.$('.tn-disc-b[data-modal="add-circle"]');
      if (n) { await n.click(); await page.waitForTimeout(400); }
      out.sheet = await page.evaluate(() => !!document.querySelector('#modal-root #nc-name'));
      return out;
    });
    ck('tapping a circle\'s disc opens that circle', tap.r.after.view === 'circle-detail' && tap.r.after.id === 'c2', JSON.stringify(tap.r.after));
    ck('tapping New opens New circle', tap.r.sheet);

    console.log('\n== the circles ==\n');
    const C = await draw('light', 'full', "showView('circles')", (page) => page.evaluate((T) => {
      (0, eval)(T);
      return { rows: [].map.call(document.querySelectorAll('.tn-crows .tn-crow'), (row) => { const d = row.querySelector('.tn-disc'); return d ? (function () { const p = document.createElement('div'); p.style.background = getComputedStyle(d).getPropertyValue('--cc'); document.body.appendChild(p); const v = getComputedStyle(p).backgroundColor; p.remove(); return v; })() : ''; }),
        c1: tok('--circle-1'), c2: tok('--circle-2') };
    }, tokenIn));
    ck('the Circles screen shows each circle\'s own disc, in its own colour', JSON.stringify(C.r.rows) === JSON.stringify([C.r.c1, C.r.c2]), JSON.stringify(C.r));
    const D = await draw('light', 'full', "showView('circle-detail',{circleId:'c2'})", (page) => page.evaluate((T) => {
      (0, eval)(T);
      const d = document.querySelector('.tn-chd-row .tn-disc');
      const p = document.createElement('div'); p.style.background = d ? getComputedStyle(d).getPropertyValue('--cc') : ''; document.body.appendChild(p);
      const v = getComputedStyle(p).backgroundColor; p.remove();
      return { has: !!d, colour: v, want: tok('--circle-2'), name: (document.querySelector('.tn-chd-big') || {}).innerText || '',
        beside: !!(d && d.parentElement && d.parentElement.querySelector('.tn-chd-big')) };
    }, tokenIn));
    ck('a circle\'s page wears its disc beside its name', D.r.has && D.r.beside && D.r.colour === D.r.want && D.r.name === 'Italy trip', JSON.stringify(D.r));

    console.log('\n== the first visit ==\n');
    const V = await draw('light', 'none', "showView('home')", (page) => page.evaluate(() => {
      const f = document.querySelector('.tn-film'); if (!f) return null;
      const r = f.getBoundingClientRect(), img = f.querySelector('img').getBoundingClientRect(), play = f.querySelector('.tn-film-play').getBoundingClientRect(), t = f.querySelector('.tn-film-t').getBoundingClientRect();
      const inside = (x) => x.left >= r.left - 1 && x.right <= r.right + 1 && x.top >= r.top - 1 && x.bottom <= r.bottom + 1;
      return { w: r.width, h: r.height, imgFills: img.width >= r.width - 1 && img.height >= r.height - 1, playIn: inside(play), textIn: inside(t), action: f.dataset.action };
    }));
    ck('the film is a real frame of it, the width of the screen', V.r && V.r.w >= 340 && V.r.h >= 150 && V.r.imgFills, JSON.stringify(V.r));
    ck('...with the play button and its words on the frame', V.r && V.r.playIn && V.r.textIn, JSON.stringify(V.r));
    ck('...and it still opens the film', V.r && V.r.action === 'open-film', V.r && V.r.action);

    console.log('\n== the same tiles everywhere ==\n');
    const S = await draw('light', 'full', "showView('library')", (page) => page.evaluate(() => [].map.call(document.querySelectorAll('#view-body .tn-tile'), (t) => !!t.querySelector('svg'))));
    ck('Saved shows a hotel and a restaurant as drawings too', S.r.length >= 2 && S.r.every(Boolean), JSON.stringify(S.r));
  } catch (e) {
    ck('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
  } finally {
    await browser.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
