// theme-sim.js - THE THEME and THE FRAME (v0.100.0). dan, 2 Nov 2026: "go with
// riviera with color on top but build it so that we can change it later
// easily". Step 1 of 4 of the visual redesign.
//
// What "change it later easily" has to mean, and what this checks:
//
//   1. ONE PLACE. Every colour and font is written once, in the THEME block at
//      the top of web/index.html, and the other pages carry an identical copy
//      (tools/sync-theme.js). Outside the block a colour may appear only as the
//      fallback half of `prop: #hex; prop: var(--x)` on critical layout, which
//      the client rules require. Every token has a night value.
//   2. CHANGING THE BLOCK CHANGES EVERYTHING. The real pages are drawn in
//      Chrome with the block swapped for one in which every colour is a
//      SENTINEL, and every coloured thing on every screen - text, backgrounds,
//      borders, icons - must then show a sentinel, by day and by night. A
//      colour left behind anywhere is named, with the element it is on. This is
//      the proof; section 1 only says where to look.
//   3. READABLE, DAY AND NIGHT. With the real theme, every piece of text on
//      every screen is measured against what is actually behind it.
//   4. THE FRAME. The bar floats as glass with the + apart from it, the list
//      runs on underneath, anything held at the bottom sits above the bar, and
//      Home wears the colour from the top of the screen.
//
//   node theme-sim.js        -> must PASS
//   node theme-sim.js --old  -> pre-riviera/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const BASE = path.join(__dirname, 'pre-riviera');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

const PAGES = ['respond', 'connect', 'collection', 'confirm', 'privacy', 'terms', 'support'];
const pageFile = (p) => {
  const name = p.replace(/^\//, '') || 'index.html';
  if (OLD && fs.existsSync(path.join(BASE, name))) return path.join(BASE, name);
  return path.join(REPO, 'web', name);
};
const read = (name) => fs.readFileSync(pageFile(name), 'utf8').replace(/\r\n/g, '\n');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 400) : '')); }
};

const START = '/* THEME:START', END = '/* THEME:END */';
const block = (t) => { const a = t.indexOf(START), b = t.indexOf(END); return a < 0 || b < a ? null : { a, b: b + END.length, text: t.slice(a, b + END.length) }; };
// Comments may name a colour; only code counts.
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const HEX = /(?<![&\w])#[0-9A-Fa-f]{6}\b|(?<![&\w])#[0-9A-Fa-f]{3}\b/g;
const tokensOf = (css) => { const o = {}; css.replace(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g, (m, k, v) => { o[k] = v.trim(); }); return o; };
const splitTheme = (b) => {
  const i = b.indexOf('@media (prefers-color-scheme: dark)');
  return { day: tokensOf(i > 0 ? b.slice(0, i) : b), night: tokensOf(i > 0 ? b.slice(i) : '') };
};
const isColour = (v) => /^#[0-9A-Fa-f]{3,8}$|^rgba?\(/.test(v);

// ── the sentinel theme: every colour token becomes rgba(17, n, 230|231, a) ──
function sentinel(html) {
  const at = block(html);
  if (!at) return html;
  let n = 0;
  const names = {};
  const swap = (part, blue) => part.replace(/(--[a-z0-9-]+)(\s*:\s*)([^;]+);/g, (m, k, sp, v) => {
    v = v.trim();
    if (!isColour(v)) return m;
    if (!(k in names)) names[k] = ++n;
    const a = (v.match(/^rgba\([^)]*,\s*([0-9.]+)\s*\)$/) || [])[1];
    return k + sp + 'rgba(17, ' + names[k] + ', ' + blue + ', ' + (a || '1') + ');';
  });
  const i = at.text.indexOf('@media (prefers-color-scheme: dark)');
  const swapped = i > 0 ? swap(at.text.slice(0, i), 230) + swap(at.text.slice(i), 231) : swap(at.text, 230);
  return html.slice(0, at.a) + swapped + html.slice(at.b);
}

// ── in the page: every colour on screen, and what is not a sentinel ──
function sweep(blue) {
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const ok = (c) => {
    if (!c || c === 'none' || c === 'transparent' || /^url\(/.test(c) || c === 'currentcolor') return true;
    const p = parse(c);
    if (!p) return true;
    if (p.a === 0) return true;
    if (p.r === 17 && p.b === blue) return true;
    // a black or white veil over something else is shade, not a colour
    if (p.a < 1 && ((p.r === 0 && p.g === 0 && p.b === 0) || (p.r === 255 && p.g === 255 && p.b === 255))) return true;
    return false;
  };
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' "' + (el.innerText || el.textContent || '').trim().slice(0, 24).replace(/\s+/g, ' ') + '"';
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (/^(SCRIPT|STYLE|IMG|IFRAME|BR|OPTION)$/.test(el.tagName) || !vis(el) || el.closest('#lib-debug')) return;
    const cs = getComputedStyle(el);
    const hasText = [].some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim());
    const props = ['background-color'];
    if (hasText || el instanceof SVGElement || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) props.push('color');
    ['top', 'right', 'bottom', 'left'].forEach((s) => { if (parseFloat(cs['border-' + s + '-width']) > 0 && cs['border-' + s + '-style'] !== 'none') props.push('border-' + s + '-color'); });
    if (el instanceof SVGElement) { props.push('fill'); props.push('stroke'); }
    props.forEach((p) => { const v = cs.getPropertyValue(p); if (!ok(v)) bad.push(name(el) + ' ' + p + ' ' + v); });
  });
  return bad;
}

// ── in the page: every piece of text against what is really behind it ──
function legibility() {
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const out = { bad: [], checked: 0, skipped: 0 };
  document.querySelectorAll('body *').forEach((el) => {
    if (/^(SCRIPT|STYLE|OPTION)$/.test(el.tagName) || !vis(el) || el.closest('#lib-debug')) return;
    const text = [].filter.call(el.childNodes, (n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!text) return;
    if (el.closest('[disabled], [aria-disabled="true"]')) { out.skipped++; return; }
    // what is behind it: each background from the top of the page down
    const chain = [];
    let opacity = 1, unknown = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      opacity *= parseFloat(cs.opacity);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') unknown = true;
      chain.push(parse(cs.backgroundColor));
    }
    if (unknown || opacity < 0.95) { out.skipped++; return; }
    let bg = [255, 255, 255, 1];
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i] && chain[i][3] > 0) bg = over(chain[i], bg);
    const cs = getComputedStyle(el);
    const fg = over(parse(cs.color), bg);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    const r = ratio(fg, bg);
    out.checked++;
    if (r < need) out.bad.push('"' + text.slice(0, 28).replace(/\s+/g, ' ') + '" ' + r.toFixed(2) + ' < ' + need + ' (' + cs.color + ' on rgb(' + bg.slice(0, 3).map(Math.round).join(',') + '))');
  });
  return out;
}

// The data a signed-in screen is drawn against. Stored colours arrive the way
// the loader hands them over: through tnColour, where the app has one.
function seed(kind) {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  var col = function (c) { return typeof tnColour === 'function' ? tnColour(c) : c; };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: col('#1D5A45'), bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._tmFetched = true; AppState._tmData = []; AppState._answered = []; AppState._feed = [];
  AppState.userCollections = []; AppState.people = []; AppState.circleInterests = [];
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: col('#1D5A45'), location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2'] },
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
  var resp = function (id, mid, name, saved) { return { id: id, contactId: mid, isAnonymous: false, degree: 1, recName: name, recNote: '', recLoc: '', recEmoji: '', savedToLibrary: saved, respondedAt: iso(now - d) }; };
  AppState.userQueries = [{ id: 'q1', circleId: 'c1', text: 'Hotels in Apulia?', degree: 1, status: 'sent', sentAt: iso(now - 3 * d), resolvedAt: null, chosenResponseId: null,
    responses: [resp('x1', 'm1', 'Masseria Moroseta', true), resp('x2', 'm2', 'Borgo Egnazia', false)] }];
  AppState._notifications = [{ id: 'n1', type: 'query', title: 'Tom is asking for a recommendation', body: 'Where do we eat in Lecce on a Sunday?', circle_id: null, actor_name: 'Tom', created_at: iso(now - d / 2), response_token: 'tok1', query_id: null, link_url: null, handled_at: null }];
  AppState.suggestions = [];
  if (kind === 'none') { AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = []; AppState.userCanonicals = []; AppState.userQueries = []; AppState._notifications = []; }
}

const SCREENS = [
  ['Sign in', '/', null, null],
  ['Home, first visit', '/', 'none', "showView('home')"],
  ['Home', '/', 'full', "showView('home')"],
  ['Saved', '/', 'full', "showView('library')"],
  ['An item', '/', 'full', "showView('rec-detail',{recId:'r1'})"],
  ['Inbox', '/', 'full', "showView('inbox')"],
  ['A question', '/', 'full', "showView('history-detail',{queryId:'q1'})"],
  ['Ask', '/', 'full', "AppState.queryMode='ask'; showView('query',{circleId:'c1'})"],
  ['Circles', '/', 'full', "showView('circles')"],
  ['A circle', '/', 'full', "showView('circle-detail',{circleId:'c1'})"],
  ['The + sheet', '/', 'full', "showView('home'); openModal('fab-menu')"],
  ['Save sheet', '/', 'full', "showView('library'); openModal('add-rec')"],
  ['New circle', '/', 'full', "showView('circles'); openModal('add-circle')"],
  ['The answer page', '/respond.html?t=tok1', null, null],
  ['Privacy', '/privacy.html', null, null],
  ['Terms', '/terms.html', null, null],
  ['Help', '/support.html', null, null],
  ['Connect an assistant', '/connect.html', null, null],
  ['Confirm a draft', '/confirm.html', null, null],
  ['Home, on a computer', '/', 'full', "showView('home')", 'wide'],
  ['Saved, on a computer', '/', 'full', "showView('library')", 'wide'],
];
const WIDE = { width: 1280, height: 860 };
// For the sabotage runs: ONLY=14 runs sections 1 and 4, PICK=Home,Saved draws only those screens.
const ONLY = process.env.ONLY || '1234';
const PICKED = SCREENS.filter((x) => !process.env.PICK || process.env.PICK.split(',').indexOf(x[0]) > -1);

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-riviera/  (must FAIL)' : 'web/') + '\n');

  // ── 1 · one place ─────────────────────────────────────────────────────────
  console.log('== 1. every colour is written in one place ==\n');
  const index = read('index.html');
  const at = block(index);
  ck('index.html has a THEME block', !!at);
  if (at) {
    const t = splitTheme(at.text);
    const dayC = Object.keys(t.day).filter((k) => isColour(t.day[k]));
    const noNight = dayC.filter((k) => !(k in t.night));
    ck('every colour has a night value (' + dayC.length + ' colours)', dayC.length > 20 && !noNight.length, noNight.join(' '));
  }
  const outside = (txt) => { const b = block(txt); return b ? txt.slice(0, b.a) + txt.slice(b.b) : txt; };
  const loose = (txt) => {
    const c = code(outside(txt)), out = [];
    let m; HEX.lastIndex = 0;
    while ((m = HEX.exec(c))) {
      const before = c.slice(Math.max(0, m.index - 60), m.index), after = c.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const d = before.match(/([a-z-]+):[^;:{}]*$/), p = after.match(/^[^;{}]*;\s*([a-z-]+):[^;{}]*var\(/);
      if (d && p && d[1] === p[1]) continue;
      // the browser's bar: checked against the theme below, not exempted blindly
      if (/theme-color"[^>]*content="$/.test(c.slice(Math.max(0, m.index - 120), m.index))) continue;
      out.push(before.slice(-30).replace(/\s+/g, ' ') + m[0]);
    }
    (c.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g) || []).forEach((r) => {
      if (!/^rgba?\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*[,)]/.test(r)) out.push(r);
    });
    return out;
  };
  const li = loose(index);
  ck('index.html writes no colour outside it, except fallbacks beside a var()', !li.length, li.length + ': ' + li.slice(0, 8).join(' | '));
  const defined = new Set(Object.keys(tokensOf(code(index).match(/:root\s*\{[^}]*\}/g) ? code(index).match(/:root\s*\{[\s\S]*?\}/g).join('\n') : '')));
  const used = new Set((code(index).match(/var\((--[a-z0-9-]+)\)/g) || []).map((v) => v.slice(4, -1)));
  const undef = [...used].filter((v) => !defined.has(v));
  ck('every var() it uses is defined', !undef.length, undef.join(' '));
  if (at) {
    const t = splitTheme(at.text);
    const metaOf = (txt) => ({ day: (txt.match(/theme-color" media="\(prefers-color-scheme: light\)" content="([^"]+)"/) || [])[1], night: (txt.match(/theme-color" media="\(prefers-color-scheme: dark\)" content="([^"]+)"/) || [])[1] });
    const wrong = ['index'].concat(PAGES).filter((p) => { const m = metaOf(read(p + '.html')); return m.day !== t.day['--band'] || m.night !== t.night['--band']; });
    ck('the browser\'s bar is the colour on top, day and night, on every page', !wrong.length, wrong.join(' '));
    const man = JSON.parse(fs.readFileSync(pageFile('manifest.webmanifest'), 'utf8'));
    ck('the home-screen app takes its colours from the theme', man.theme_color === t.day['--band'] && man.background_color === t.day['--ground'], man.theme_color + ' / ' + man.background_color);
  }
  const fall = (sel, prop) => new RegExp('(^|\\n|\\})\\s*' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*' + prop + ':\\s*#[0-9A-Fa-f]{3,6};\\s*' + prop + ':\\s*var\\(').test(index);
  const crit = [['body', 'background'], ['body', 'color'], ['.btn-primary', 'background'], ['#mobile-tabbar', 'background'], ['.field-input, .search-input', 'background']];
  const noFall = crit.filter(([s, p]) => !fall(s, p));
  ck('critical layout keeps a plain colour beside its var() (client rule)', !noFall.length, noFall.map((x) => x.join(' ')).join(', '));
  PAGES.forEach((p) => {
    const t = read(p + '.html'), b = block(t);
    ck(p + '.html carries the same theme', !!(b && at && b.text === at.text), b ? 'differs - run node tools/sync-theme.js' : 'no block');
    const l = loose(t);
    ck(p + '.html writes no colour outside it', !l.length, l.length + ': ' + l.slice(0, 6).join(' | '));
  });
  const src = code(index);
  ck('stored circle colours are read through tnColour', /color:\s*tnColour\(c\.color\)/.test(src));
  ck('stored person colours are read through tnColour', /avatarColor:\s*tnColour\(prof\.data\.avatar_color\)/.test(src) && /avatarColor:\s*tnColour\(person\.data\.avatar_color\)/.test(src));
  ck('new circles store a slot of the theme, not a colour', /const CIRCLE_COLOURS = \['var\(--circle-1\)'/.test(src));

  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const context = async (opts) => {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, isMobile: !opts.viewport, hasTouch: !opts.viewport, colorScheme: opts.scheme || 'light',
      userAgent: opts.viewport ? undefined : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript({ content: 'try{Object.defineProperty(navigator,"standalone",{get:function(){return true;}});}catch(e){}window.open=function(){return null;};' });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      const f = pageFile(p === '/' ? '/index.html' : p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(f);
      if (opts.sentinel && /\.html$/.test(f)) body = sentinel(body.toString('utf8'));
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      if (p === '/functions/v1/response-meta') return json({ requester_name: 'Tom', circle_name: 'Travel', query_text: 'Where do we eat in Lecce on a Sunday?' });
      if (p.indexOf('/functions/v1/') === 0) return json({});
      if (p.indexOf('/rest/v1/rpc/') === 0) return json(null);
      if (p.indexOf('/rest/v1/') === 0) return json([]);
      return json({});
    });
    return ctx;
  };
  const settle = (page) => page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
  const draw = async (opts, [name, url, kind, go], fn) => {
    const ctx = await context(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com' + url);
    await settle(page);
    await page.waitForTimeout(400);
    if (kind) {
      await page.evaluate((o) => {
        (0, eval)('(' + o.seed + ')')(o.kind);
        document.getElementById('login').style.display = 'none';
        document.getElementById('onboarding').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        (0, eval)(o.go);
      }, { seed: seed.toString(), kind, go });
      await page.waitForTimeout(500);
    }
    const r = await fn(page);
    await ctx.close();
    return { r, errs };
  };

  try {
    // ── 2 · change the block and everything changes ─────────────────────────
    console.log('\n== 2. with every colour in the block swapped, every screen changes, day and night ==\n');
    if (ONLY.indexOf('2') > -1) for (const scheme of ['light', 'dark']) {
      for (const s of PICKED) {
        const { r, errs } = await draw({ sentinel: true, scheme, viewport: s[4] === 'wide' ? WIDE : undefined }, s, (page) => page.evaluate(sweep, scheme === 'light' ? 230 : 231));
        ck(s[0] + ' (' + (scheme === 'light' ? 'day' : 'night') + '): nothing keeps a colour of its own', r.length === 0, r.length + ': ' + r.slice(0, 5).join(' | '));
        if (errs.length) ck(s[0] + ': draws without an error', false, errs.join(' | '));
      }
    }

    // ── 3 · readable ──────────────────────────────────────────────────────────
    console.log('\n== 3. every piece of text can be read, day and night ==\n');
    if (ONLY.indexOf('3') > -1) for (const scheme of ['light', 'dark']) {
      for (const s of PICKED) {
        const { r } = await draw({ scheme, viewport: s[4] === 'wide' ? WIDE : undefined }, s, (page) => page.evaluate(legibility));
        ck(s[0] + ' (' + (scheme === 'light' ? 'day' : 'night') + '): ' + r.checked + ' pieces of text readable', r.checked > 0 && r.bad.length === 0, r.bad.length + ': ' + r.bad.slice(0, 4).join(' | '));
      }
    }

    // ── 4 · the frame ────────────────────────────────────────────────────────
    console.log('\n== 4. the frame ==\n');
    if (ONLY.indexOf('4') > -1) {
    const frame = await draw({}, SCREENS[2], (page) => page.evaluate(() => {
      const bar = document.getElementById('mobile-tabbar'), fab = document.querySelector('.mfab'), vb = document.getElementById('view-body');
      const b = bar.getBoundingClientRect(), f = fab.getBoundingClientRect(), v = vb.getBoundingClientRect();
      const cs = getComputedStyle(bar);
      const probe = document.createElement('div'); probe.style.background = 'var(--band)'; document.body.appendChild(probe);
      const band = getComputedStyle(probe).backgroundColor; probe.style.background = 'var(--ground)';
      const ground = getComputedStyle(probe).backgroundColor; probe.remove();
      const bandEl = document.querySelector('.tn-home > .tn-band');
      return { b: { l: b.left, r: b.right, t: b.top, bot: b.bottom, h: b.height }, f: { l: f.left, r: f.right, t: f.top, bot: f.bottom },
        v: { bot: v.bottom }, pad: parseFloat(getComputedStyle(vb).paddingBottom) + (parseFloat(getComputedStyle(vb, '::after').height) || 0), radius: parseFloat(cs.borderTopLeftRadius),
        blur: (cs.backdropFilter || cs.webkitBackdropFilter || '').indexOf('blur') > -1, pos: cs.position,
        tabs: [].map.call(document.querySelectorAll('#mobile-tabbar .mtab'), (t) => t.innerText.trim().split(/\s*\n\s*/).pop()),
        band, ground, bandFirst: !!bandEl, bandBg: bandEl ? getComputedStyle(bandEl).backgroundColor : '',
        topbar: getComputedStyle(document.querySelector('#main .topbar')).backgroundColor,
        wide: document.scrollingElement.scrollWidth };
    }));
    const F = frame.r;
    ck('the bar floats: fixed, clear of the edges, round', F.pos === 'fixed' && F.b.l >= 12 && F.b.bot <= 844 - 8 && F.radius >= 28, JSON.stringify(F.b) + ' radius ' + F.radius);
    ck('the bar is glass', F.blur);
    ck('the + stands apart, to the right of the bar', F.f.l >= F.b.r + 6 && F.f.r <= 390 - 8 && Math.abs(F.f.t - F.b.t) < 6, JSON.stringify(F.f));
    ck('the tabs are Home, Circles, Inbox, Saved', JSON.stringify(F.tabs) === '["Home","Circles","Inbox","Saved"]', JSON.stringify(F.tabs));
    ck('the list runs on underneath the bar', F.v.bot >= F.b.bot && F.pad >= F.b.h, 'view-body bottom ' + F.v.bot + ', room at the end ' + F.pad);
    ck('Home opens with the colour band', F.bandFirst && F.bandBg === F.band, F.bandBg + ' vs ' + F.band);
    ck('...and the top of the screen wears it too', F.topbar === F.band, F.topbar);
    ck('nothing on Home is wider than the phone', F.wide <= 390, F.wide);
    const saved = await draw({}, SCREENS[3], (page) => page.evaluate(() => getComputedStyle(document.querySelector('#main .topbar')).backgroundColor));
    ck('other screens keep the plain sky at the top', saved.r !== F.band && saved.r === F.ground, saved.r);
    const first = await draw({}, SCREENS[1], (page) => page.evaluate(() => {
      const big = document.querySelector('.tn-band .tn-intro-big');
      return { text: big ? big.innerText : '', font: big ? getComputedStyle(big).fontFamily : '' };
    }));
    ck('a first visit opens with "Ask & share" on the band', first.r.text === 'Ask & share', first.r.text);
    ck('...in the phone\'s own type, not a serif', /^-apple-system/.test(first.r.font), first.r.font);
    // A circle big enough that its people run past the bottom of the screen:
    // only then is the send button HELD at the bottom, and only then can it end
    // up behind the bar. With two people it sits in the flow, above the bar
    // whatever the CSS says - which is how this check first passed with its
    // mechanism removed.
    const many = "for (var i = 3; i < 17; i++) { AppState.userMembers.push({ id: 'm' + i, circleId: 'c1', name: 'Friend ' + i, avatar: 'F', avatarColor: 'var(--circle-2)', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+97250000' + (1000 + i), responseRate: 'unknown', isExternalSource: false, linkedUserId: null }); AppState.userCircles[0].memberIds.push('m' + i); } ";
    const ask = await draw({}, ['Ask, a big circle', '/', 'full', many + SCREENS[7][3]], async (page) => {
      await page.evaluate(() => { document.getElementById('view-body').scrollTop = 0; });
      await page.waitForTimeout(200);
      return page.evaluate(() => { const s = document.getElementById('q-send'), b = document.getElementById('mobile-tabbar'), vb = document.getElementById('view-body');
        return s && b ? { s: s.getBoundingClientRect().bottom, b: b.getBoundingClientRect().top, longer: vb.scrollHeight > vb.clientHeight + 200 } : null; });
    });
    ck('[precondition] the Ask screen is long enough to scroll', ask.r && ask.r.longer, JSON.stringify(ask.r));
    ck('Ask\'s send button sits above the bar, not behind it', ask.r && ask.r.s <= ask.r.b - 4, JSON.stringify(ask.r));
    const colours = await draw({}, SCREENS[2], (page) => page.evaluate(() => typeof tnColour === 'function'
      ? [tnColour('#1D5A45'), tnColour('#c0392b'), tnColour('#217A4B'), tnColour('var(--circle-3)'), tnColour('')] : null));
    const C = colours.r || [];
    ck('an old stored colour becomes a slot of the theme', C[0] === 'var(--circle-1)' && C[1] === 'var(--circle-2)' && /^var\(--circle-[1-8]\)$/.test(C[2] || '') && C[3] === 'var(--circle-3)' && C[4] === '', JSON.stringify(C));
    const icons = await draw({}, SCREENS[0], (page) => page.evaluate(async () => {
      const probe = document.createElement('div'); probe.style.background = 'var(--band)'; document.body.appendChild(probe);
      const want = getComputedStyle(probe).backgroundColor; probe.remove();
      const px = async (src, x, y) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(x, y, 1, 1).data; return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')'; };
      return { want, icon: await px('/icons/icon-192.png', 6, 6), touch: await px('/icons/apple-touch-icon.png', 6, 6), tab: await px('/icons/favicon-32.png', 2, 2) };
    }));
    ck('the app icons are the colour on top', icons.r.icon === icons.r.want && icons.r.touch === icons.r.want && icons.r.tab === icons.r.want, JSON.stringify(icons.r));
    const desk = await draw({ viewport: { width: 1280, height: 860 } }, SCREENS[2], (page) => page.evaluate(() => ({
      bar: getComputedStyle(document.getElementById('mobile-tabbar')).display, side: getComputedStyle(document.getElementById('sidebar')).display })));
    ck('on a computer the side bar stays and the phone bar does not show', desk.r.bar === 'none' && desk.r.side !== 'none', JSON.stringify(desk.r));
    }
  } catch (e) {
    ck('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
  } finally {
    await browser.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
