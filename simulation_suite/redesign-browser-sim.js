// redesign-browser-sim.js - the v0.95.0 redesign, rendered and USED in a real
// browser at phone width, with realistic data and no network.
//
// WHY IT EXISTS. v0.94.0 shipped a dialog that could not open while the suite
// was green, because the suite asserted things about helpers and never drew
// the screen. This draws every screen, and then does the things a person does
// on the ones that changed: taps a step, pastes a number, flips the degree.
//
// It found three real faults on its first runs, all fixed in v0.95.0:
//   - The Ask screen threw "Cannot access 'qCircle' before initialization" on
//     EVERY render, live since the degree toggle was wired - the Degree 1/2
//     buttons never got their listeners. (Group 6 below.)
//   - circleCardHtml was declared twice; the old one silently won. (Group 7.)
//   - An icon with no size drew at 300x150 and crushed its row. (Group 1's
//     "sticks out" check.)
//
// HOW IT RENDERS AT PHONE WIDTH. Headless Chrome on Windows will not open a
// window narrower than ~512px, so --window-size=390 silently lays the page out
// at 512 and crops it - which is how the first screenshots here lied. The page
// is loaded inside a 390px iframe instead: a true phone viewport, media
// queries and all, reporting back through postMessage.
//
//   node redesign-browser-sim.js         -> must PASS
//   node redesign-browser-sim.js --old   -> index.pre-v0.95.0.html, must FAIL
//   node redesign-browser-sim.js --old2  -> index.pre-v0.95.1.html, must FAIL
//        (v0.95.1's own baseline: the Home buttons, the circle's ..., and every
//        action reachable without scrolling - group 9)
//   --shots <dir>                        -> also write a PNG per screen
//
// Needs Chrome. Skips cleanly (exit 2) without it.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const useOld2 = process.argv.indexOf('--old2') > -1;
const useOld = useOld2 || process.argv.indexOf('--old') > -1;
const FILE = useOld2 ? path.join(__dirname, 'index.pre-v0.95.1.html')
  : useOld ? path.join(__dirname, 'index.pre-v0.95.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(FILE)) { console.error('missing fixture: ' + FILE); process.exit(2); }
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) { console.error('no Chrome on this machine - skipping.'); process.exit(2); }
const si = process.argv.indexOf('--shots');
const SHOTS = si > -1 ? path.resolve(process.argv[si + 1]) : '';
const W = 390, H = 844;
const TMP = process.env.TEMP || process.env.TMP || '.';

const DATA = `
function __data(kind) {
  var now = Date.now(), h = 3600e3, d = 24 * h;
  var iso = function (ms) { return new Date(ms).toISOString(); };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'dan shapiro', avatar: 'DS', avatarColor: '#1D5A45', bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'd@x.com' };
  AppState._authEmail = 'd@x.com';
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState.userCollections = []; AppState.suggestions = []; AppState.people = []; AppState.circleInterests = [];
  AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = []; AppState.userCanonicals = []; AppState.userQueries = [];
  AppState._feed = []; AppState._notifications = [];
  if (kind === 'fresh' || kind === 'login' || kind === 'invite') return;
  var C = function (id, name, domain, color) { return { id: id, ownerId: 'me', name: name, domain: domain, description: '', color: color, location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: [] }; };
  AppState.userCircles = [C('c1', 'Travel', 'travel', '#2C5877')];
  if (kind === 'circleOnly') return;
  AppState.userCircles.push(C('c2', 'Italy trip', 'travel', '#97472A'), C('c3', '\\u05d1\\u05e2\\u05dc\\u05d9 \\u05de\\u05e7\\u05e6\\u05d5\\u05e2', 'home', '#6E5A26'), C('c4', 'Books', 'culture', '#62427A'));
  var M = function (id, cid, name, av, color, method, value, linked) {
    return { id: id, circleId: cid, name: name, avatar: av, avatarColor: color, trustBasis: '', contactMethod: method, contactValue: value, responseRate: 'unknown', isExternalSource: false, sourceType: null, sourceUrl: null, linkedUserId: linked, personId: 'p' + id, addedAt: iso(now - 30 * d) };
  };
  AppState.userMembers = [
    M('m1', 'c1', 'Tom Shapiro', 'TS', '#3F6C8A', 'whatsapp', '+972500000001', 'u1'),
    M('m2', 'c1', 'Tal Shapiro', 'TS', '#B0643E', 'whatsapp', '+972500000002', 'u2'),
    M('m3', 'c1', 'may shapiro', 'MS', '#7B5D98', 'whatsapp', '+972500000003', null),
    M('m4', 'c1', 'Rany', 'R', '#4E7C5D', 'whatsapp', '+972500000004', 'u4'),
    M('m5', 'c1', 'Tchia', 'T', '#A4833A', 'email', '', null),
    M('m6', 'c2', 'Tom Shapiro', 'TS', '#3F6C8A', 'whatsapp', '+972500000001', 'u1'),
    M('m7', 'c3', 'Rany', 'R', '#4E7C5D', 'whatsapp', '+972500000004', 'u4'),
    M('m8', 'c4', 'Tal Shapiro', 'TS', '#B0643E', 'whatsapp', '+972500000002', 'u2')
  ];
  AppState.userCircles.forEach(function (c) { c.memberIds = AppState.userMembers.filter(function (m) { return m.circleId === c.id; }).map(function (m) { return m.id; }); });
  var K = function (id, name, cat, kind, loc) { return { id: id, type: 'place', name: name, category: '', kind: kind, location: loc, description: '', imageEmoji: '', googleUrl: null, websiteUrl: null, primaryCategory: cat, aiTags: [], imageUrl: '', hasSearchDoc: true }; };
  AppState.userCanonicals = [
    K('k1', 'Masseria Moroseta', 'travel', 'hotel', 'Ostuni, Puglia'),
    K('k2', 'Arte', 'dining', 'restaurant', 'Lecce'),
    K('k3', '\\u05d0\\u05d9\\u05dc\\u05df \\u05d4\\u05d5\\u05d5\\u05d8\\u05e8\\u05d9\\u05e0\\u05e8', 'healthcare', 'vet', 'Tel Aviv'),
    K('k4', 'Matera', 'travel', 'town', 'Basilicata, Italy'),
    K('k5', '\\u05e8\\u05d5\\u05e2\\u05d9 \\u05de\\u05d5\\u05e8\\u05d4 \\u05dc\\u05e0\\u05d4\\u05d9\\u05d2\\u05d4', 'professional', 'driving instructor', ''),
    K('k6', 'Minzar', 'dining', 'bar', 'Tel Aviv'),
    K('k7', 'A Pattern Language', 'culture', 'book', '')
  ];
  var R = function (id, kid, cid, by, note, t) { return { id: id, canonicalId: kid, circleId: cid, recommendedBy: by, note: note, rating: 0, tags: [], status: 'saved', date: iso(t), addedAt: iso(t), category: '' }; };
  AppState.userRecs = [
    R('r1', 'k1', 'c1', 'm2', 'Book the room with the terrace.', now - 2 * h),
    R('r2', 'k2', 'c1', 'm1', 'Ask for the orecchiette.', now - 5 * h),
    R('r3', 'k3', 'c3', 'm7', '', now - 2 * d),
    R('r4', 'k4', 'c1', 'm3', 'Stay in the Sassi, not the new town.', now - 9 * d),
    R('r5', 'k5', 'c3', 'm1', '', now - 12 * d),
    R('r6', 'k6', 'c2', null, '', now - 20 * d),
    R('r7', 'k7', 'c4', 'm8', '', now - 30 * d)
  ];
  var resp = function (id, mid, name, note, t, saved) { return { id: id, contactId: mid, isAnonymous: false, degree: 1, recName: name, recNote: note, recLoc: '', recEmoji: '', savedToLibrary: !!saved, respondedAt: iso(t) }; };
  AppState.userQueries = [
    { id: 'q1', circleId: 'c1', text: 'Hotels and restaurants in Apulia?', degree: 1, status: 'sent', sentAt: iso(now - 3 * d), resolvedAt: null, chosenResponseId: null,
      responses: [resp('x1', 'm2', 'Masseria Moroseta', 'Book the room with the terrace.', now - 2 * h, true), resp('x2', 'm1', 'Arte', 'Ask for the orecchiette.', now - 5 * h, true), resp('x3', 'm4', 'Borgo Egnazia', 'Pricey. Worth one night.', now - 6 * h, false), resp('x4', 'm3', 'Matera', 'Stay in the Sassi.', now - 7 * h, true)] },
    { id: 'q2', circleId: 'c3', text: 'A plumber who actually shows up?', degree: 1, status: 'sent', sentAt: iso(now - 5 * d), resolvedAt: null, chosenResponseId: null,
      responses: [resp('x5', 'm7', 'Yossi the plumber', 'Came the same day.', now - 4 * d, false)] },
    { id: 'q3', circleId: 'c4', text: 'Something to read on the plane', degree: 1, status: 'sent', sentAt: iso(now - 1 * d), resolvedAt: null, chosenResponseId: null, responses: [] }
  ];
  AppState._notifications = [
    { id: 'n1', type: 'query', title: 'Tom is asking for a recommendation', body: 'Where do we eat in Lecce on a Sunday?', circle_id: null, actor_name: 'Tom', created_at: iso(now - 20 * h), response_token: 'tok1', query_id: 'zz', link_url: null, handled_at: null },
    { id: 'n2', type: 'invite_accepted', title: 'Rany joined your Travel circle', body: 'They joined via your invite link and can now receive your queries.', circle_id: 'c1', actor_name: 'Rany', created_at: iso(now - 4 * d), response_token: null, query_id: null, link_url: null, handled_at: null }
  ];
  AppState._feed = [
    { canonical_id: 'kf1', can_name: '\\u05d2\\u05dc \\u05d4\\u05de\\u05d3\\u05d1\\u05d9\\u05e8', can_location: 'Tel Aviv', can_category: 'Pest control', can_emoji: '', recommender_name: 'Rany', circle_name: '\\u05d1\\u05e2\\u05dc\\u05d9 \\u05de\\u05e7\\u05e6\\u05d5\\u05e2', domain: 'home', note: 'Came the same day. Didn\\u2019t upsell.', rating: 0, primary_category: 'home', ai_tags: [] },
    { canonical_id: 'kf2', can_name: 'Trattoria Nonna Nietta', can_location: 'Ostuni', can_category: 'Restaurant', can_emoji: '', recommender_name: 'May', circle_name: 'Italy trip', domain: 'travel', note: '', rating: 0, primary_category: 'dining', ai_tags: [] }
  ];
  AppState.suggestions = [
    { id: 's1', canonical_id: 'ks1', from_person_id: null, from_user_id: 'u3', from_name: 'May', via: 'saved', source_note: '', query_text: '', matched_circles: ['c2'], matched_interest: 'restaurant', status: 'pending',
      canonicals: { id: 'ks1', name: 'Trattoria Nonna Nietta', kind: 'restaurant', location: 'Ostuni', primary_category: 'dining', category: '' } }
  ];
}
function __sheet() {
  var it = function (name, loc, cat, by, note, fromYou) { return { name: name, location: loc, category: cat, recommenders: by ? [by] : [], notes: note ? [{ by: by, note: note }] : [], from_you: !!fromYou, rating: 0, tags: [] }; };
  return { queryId: 'q1', loading: false, data: { engine: 'sheet-v7', counts: { total: 5, from_circle: 4, from_you: 1 },
    items: [ it('Masseria Moroseta', 'Ostuni', 'travel', 'Tal', 'Book the room with the terrace.'), it('Borgo Egnazia', 'Fasano', 'travel', 'Rany', 'Pricey. Worth one night.'),
             it('Arte', 'Lecce', 'dining', 'Tom', 'Ask for the orecchiette.'), it('Osteria del Tempo Perso', 'Ostuni', 'dining', 'May', '', true) ] } };
}
function __stubInvite() {
  var real = sb.rpc.bind(sb);
  sb.rpc = function (fn, args) {
    if (fn === 'invite_preview') return Promise.resolve({ data: { ok: true, inviter: 'Tom', circle: 'Travel' }, error: null });
    return real(fn, args);
  };
}
function __clip(text) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: function () {
    return text === null ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(text);
  } } });
}
function __showLogin() {
  if (typeof showLoginScreen === 'function' && window.__realShowLogin) window.__realShowLogin();
}
`;
// Each screen: how a person reaches it, and (optionally) what to read or DO
// once it is there. Probes run in the page; no backslashes or backticks in
// them - they travel inside a template literal.
const Q = (sel) => "document.querySelectorAll('" + sel + "').length";
// Reachable without scrolling: the element's box lies inside the visible part
// of the screen - below the top, above the tab bar.
const SEEN = (sel) => "(function () { var e = document.querySelector('" + sel + "'); if (!e) return false; var r = e.getBoundingClientRect(); var tb = document.getElementById('mobile-tabbar'); var floor = tb && tb.getBoundingClientRect().height ? tb.getBoundingClientRect().top : window.innerHeight; return r.height > 0 && r.top >= 0 && r.bottom <= floor + 1; })()";
const SCREENS = [
  { n: 'home-new', setup: 'fresh', go: "showView('home')",
    probe: "({ steps: " + Q('.tn-step') + ", on: [].map.call(document.querySelectorAll('.tn-step.on b'), function (b) { return b.textContent; }), locked: " + Q('.tn-step:not(.on):not(.done)') + " })" },
  { n: 'home-circle', setup: 'circleOnly', go: "showView('home')",
    probe: "({ done: " + Q('.tn-step.done') + ", on: [].map.call(document.querySelectorAll('.tn-step.on b'), function (b) { return b.textContent; }) })" },
  { n: 'home', setup: 'full', go: "showView('home')",
    probe: "({ steps: " + Q('.tn-step') + ", ask: " + Q('.tn-askbox') + ", verbs: [].map.call(document.querySelectorAll('.tn-verbs .btn'), function (b) { return b.textContent + '|' + b.dataset.mode; }), chipBg: (function () { var c = document.querySelector('.tn-circlechips .tn-chip'); return c ? getComputedStyle(c).backgroundColor : ''; })(), chips: " + Q('.tn-chip') + ", answer: (document.querySelector('a.tn-bigbtn') || {}).href || '', qcards: " + Q('.tn-qc') + ", stats: " + Q('.stat-row') + ", taste: document.getElementById('view-body').textContent.indexOf('Taste Match is available') > -1, feed: " + Q('.tn-fe') + " })" },
  { n: 'menu', setup: 'full', go: "showView('home'); openMenu()",
    probe: "({ views: [].map.call(document.querySelectorAll('#tn-menu [data-view]'), function (e) { return e.dataset.view; }), signout: " + Q('#tn-menu [data-action=menu-signout]') + " })" },
  { n: 'fab', setup: 'full', go: "showView('home'); openModal('fab-menu')",
    probe: "({ save: " + Q('[data-action=fab-save]') + ", rec: " + Q('[data-action=fab-recommend]') + ", ask: " + Q('[data-action=fab-ask]') + " })" },
  { n: 'add-member', setup: 'full', go: "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1'})",
    probe: "({ paste: " + Q('[data-action=paste-number]') + " })" },
  { n: 'paste-ok', setup: 'full', go: "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1'}); __clip(String.fromCharCode(0x202a) + '+972 52-811-4460' + String.fromCharCode(0x202c)); document.querySelector('[data-action=paste-number]').click()",
    probe: "({ phone: (document.getElementById('nm-phone') || {}).value, country: (document.getElementById('nm-country') || {}).value, note: (document.getElementById('nm-paste-note') || {}).textContent, focus: document.activeElement && document.activeElement.id, form: (document.getElementById('nm-form-pane') || { style: {} }).style.display })" },
  { n: 'paste-refused', setup: 'full', go: "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1'}); __clip(null); document.querySelector('[data-action=paste-number]').click()",
    probe: "({ note: (document.getElementById('nm-paste-note') || {}).textContent, focus: document.activeElement && document.activeElement.id })" },
  { n: 'query', setup: 'full', go: "AppState.queryMode='ask'; showView('query',{circleId:'c1'})",
    probe: "(function () { var d2 = document.getElementById('q-deg-2'); if (d2) d2.click(); var w = document.getElementById('q-who'); return { degree: AppState.queryDegree, who: w ? w.style.pointerEvents : null, title: document.getElementById('topbar-title').textContent, send: " + SEEN('#q-send') + " }; })()" },
  { n: 'query-draft', setup: 'full', go: "AppState.queryMode='ask'; AppState.queryDegree=1; showView('query',{circleId:'c1'})",
    probe: "(function () { var t = document.getElementById('q-text'); t.value = 'Where to eat in Lecce'; document.getElementById('q-mode-rec').click(); var mid = document.getElementById('topbar-title').textContent; document.getElementById('q-mode-ask').click(); var t2 = document.getElementById('q-text'); return { draft: t2 ? t2.value : null, midTitle: mid }; })()" },
  { n: 'query-rec', setup: 'full', go: "AppState.queryMode='recommend'; showView('query',{circleId:'c1'})", probe: "({})" },
  { n: 'library', setup: 'full', go: "showView('library')", probe: "({ rows: " + Q('.tn-rec') + " })" },
  { n: 'circles', setup: 'full', go: "showView('circles')", probe: "({ rows: " + Q('.tn-crow') + ", cards: " + Q('.circle-card') + " })" },
  { n: 'circle', setup: 'full', go: "showView('circle-detail',{circleId:'c1'})",
    probe: "({ faces: " + Q('.tn-face') + ", add: " + Q('.tn-face[data-modal=add-member]') + ", pair: " + Q('.tn-pair .btn') + ", back: (document.querySelector('.tn-back') || {}).textContent || '', more: " + SEEN('.tn-more') + ", bottom: " + Q('.tn-manage') + " })" },
  { n: 'circle-more', setup: 'full', go: "showView('circle-detail',{circleId:'c1'}); openModal('circle-more',{circleId:'c1'})",
    probe: "({ acts: [].map.call(document.querySelectorAll('.modal [data-action]'), function (b) { return b.dataset.action + (b.dataset.modal ? ':' + b.dataset.modal : ''); }) })" },
  { n: 'inbox', setup: 'full', go: "showView('inbox')",
    probe: "(function () { var html = document.getElementById('view-body').innerHTML; var live = html.split('respond.html?t=').length - 1; var chips = " + Q('[data-action=inbox-filter]') + "; var b = document.querySelector('[data-action=inbox-filter][data-filter=answers]'); if (b) b.click(); return { live: live, chips: chips, answers: " + Q('.tn-ib') + " }; })()" },
  { n: 'add-rec', setup: 'full', go: "showView('library'); openModal('add-rec')",
    probe: "(function () { var o = " + Q('.ar-circle-opt') + "; var c1 = document.querySelector('.ar-circle-opt[data-circle-id=c1]'); if (c1) c1.click(); var sw = document.getElementById('ar-send'); if (sw) sw.click(); return { opts: o, chosen: (document.getElementById('ar-circle') || {}).value, label: (document.getElementById('ar-save') || {}).textContent }; })()" },
  { n: 'sheet', setup: 'full', go: "AppState._sheet = __sheet(); showView('sheet',{queryId:'q1'})",
    probe: "({ q: (document.querySelector('.tn-sheet-q') || {}).textContent || '', items: " + Q('.tn-sheet-it') + ", save: " + Q('[data-action=save-from-sheet]') + " })" },
  { n: 'login', setup: 'login', go: "__showLogin()",
    probe: "({ h: (document.querySelector('.tn-login-h') || {}).textContent || '', alt: " + Q('#login-to-email') + " })" },
  { n: 'login-invite', setup: 'invite', go: "__stubInvite(); __showLogin()",
    probe: "({ h: (document.querySelector('.tn-inv-h') || {}).textContent || '', btn: " + Q('#login [data-action=codeless-join]') + ", form: (document.getElementById('login-methods') || { style: {} }).style.display })" },
  { n: 'history', setup: 'full', go: "showView('history')", probe: "({})" },
  { n: 'history-detail', setup: 'full', go: "showView('history-detail',{queryId:'q1'})", probe: "({})" },
  { n: 'rec-detail', setup: 'full', go: "['m1','m3','m4','m6','m7'].forEach(function (m, i) { AppState.userRecs.push({ id: 'rx' + i, canonicalId: 'k1', circleId: 'c1', recommendedBy: m, note: 'The terrace room faces the olive grove. Breakfast is made in the house and it is the reason to stay; ask for the fig jam.', rating: 0, tags: [], status: 'saved', date: new Date().toISOString(), category: '' }); }); showView('rec-detail',{recId:'r1'})",
    probe: "({ status: " + SEEN('[data-status=dismissed]') + ", recs: document.getElementById('view-body').textContent.split('olive grove').length - 1 })" },
  { n: 'profile', setup: 'full', go: "showView('profile')", probe: "({ save: " + SEEN('[data-action=save-profile]') + " })" },
  { n: 'settings', setup: 'full', go: "showView('settings')", probe: "({})" },
  { n: 'answered', setup: 'full', go: "showView('answered')", probe: "({})" },
  { n: 'taste', setup: 'full', go: "showView('taste-match')", probe: "({})" },
  { n: 'add-circle', setup: 'full', go: "showView('circles'); openModal('add-circle')", probe: "({})" },
];

function run(screen) {
  const shim = `
<script>
window.__realShowLogin = typeof showLoginScreen === 'function' ? showLoginScreen : null;
showLoginScreen = function () {};
window.__errs = [];
document.head.insertAdjacentHTML('beforeend', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>');
window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
${DATA}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = { ok: true };
    try {
      if ('${screen.setup}' === 'invite') localStorage.setItem('tn_join_token', 'tok-demo');
      else localStorage.removeItem('tn_join_token');
      localStorage.removeItem('tn_has_recommended');
      __data('${screen.setup}');
      document.getElementById('loading-screen').style.display = 'none';
      if ('${screen.setup}' !== 'login' && '${screen.setup}' !== 'invite') {
        document.getElementById('login').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
      }
      ${screen.go};
    } catch (e) { out.ok = false; out.threw = String(e && e.message || e); }
    setTimeout(function () {
      try { out.p = ${screen.probe || '({})'}; } catch (e) { out.p = { probeThrew: String(e && e.message || e) }; }
      var de = document.documentElement;
      out.errs = window.__errs;
      out.overflow = Math.max(de.scrollWidth, document.body.scrollWidth) - window.innerWidth;
      var wide = [];
      document.querySelectorAll('#main *, #modal-root *, #tn-menu *, #login *').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed') {
          var p = el, clipped = false;
          while (p && p !== document.body) {
            var cs = getComputedStyle(p);
            if (p !== el && (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') && p.getBoundingClientRect().right <= window.innerWidth + 1) { clipped = true; break; }
            p = p.parentElement;
          }
          if (!clipped) wide.push(String(el.id ? '#' + el.id : (el.className && el.className.baseVal !== undefined ? 'svg' : el.className) || el.tagName).slice(0, 40) + ' ' + Math.round(r.right));
        }
      });
      out.wide = wide.slice(0, 5);
      try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e) {}
    }, 400);
  }, 250);
});
</script>`;
  const src = fs.readFileSync(FILE, 'utf8');
  const inner = path.join(TMP, 'tn-rds-' + screen.n + '.html');
  fs.writeFileSync(inner, src.replace('</body>', shim + '</body>'), 'utf8');
  const outer = path.join(TMP, 'tn-rds-outer-' + screen.n + '.html');
  fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title><style>html,body{margin:0;background:#fff}</style></head><body>'
    + '<iframe src="' + path.basename(inner) + '" style="width:' + W + 'px;height:' + H + 'px;border:0;display:block"></iframe>'
    + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
  const url = 'file:///' + outer.split(path.sep).join('/');
  const base = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=520,' + H, '--virtual-time-budget=7000'];
  let dom = '';
  try { dom = cp.execFileSync(CHROME, base.concat(['--dump-dom', url]), { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { dom = String(e.stdout || ''); }
  if (SHOTS) { try { cp.execFileSync(CHROME, base.concat(['--screenshot=' + path.join(SHOTS, screen.n + '.png'), url]), { stdio: 'ignore' }); } catch (e) {} }
  const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
  if (!m) return { n: screen.n, ok: false, threw: 'never rendered', p: {} };
  const r = JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  r.n = screen.n; r.p = r.p || {};
  return r;
}

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
console.log('\n   fixture: ' + path.basename(FILE) + (useOld ? '   (must FAIL)' : '') + '\n');

const R = {};
console.log('== 1. every screen draws, at phone width, without throwing or spilling ==\n');
SCREENS.forEach((s) => {
  const r = run(s);
  R[s.n] = r;
  const errs = (r.errs || []).filter((e) => !/supabase|fetch|Failed to fetch|NetworkError|Load failed|getSession|invalid api key|JWT/i.test(e));
  const probs = [];
  if (!r.ok) probs.push('threw: ' + r.threw);
  errs.forEach((e) => probs.push('page error: ' + e));
  if (r.overflow > 0) probs.push('page wider than the phone by ' + r.overflow + 'px');
  if (r.wide && r.wide.length) probs.push('sticks out: ' + r.wide.join(' | '));
  if (r.p && r.p.probeThrew) probs.push('probe threw: ' + r.p.probeThrew);
  ck(s.n, !probs.length, probs.join('; '));
});
const P = (n) => (R[n] && R[n].p) || {};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n== 2. first time in: three steps, each opening the next ==\n');
ck('a new account sees exactly three steps', P('home-new').steps === 3, JSON.stringify(P('home-new')));
ck('...only "Create your first circle" is live', eq(P('home-new').on, ['Create your first circle']), JSON.stringify(P('home-new').on));
ck('...and the other two are locked', P('home-new').locked === 2);
ck('with a circle, step one is done and "Add friends" is live',
   P('home-circle').done === 1 && eq(P('home-circle').on, ['Add friends']), JSON.stringify(P('home-circle')));
ck('with people and a question asked, the steps are gone for good', P('home').steps === 0, String(P('home').steps));

console.log('\n== 3. Home: ask, circles, what is waiting, your questions, what was shared ==\n');
ck('Home opens with a way to ask', (P('home').verbs || []).length === 2 || P('home').ask === 1, JSON.stringify(P('home').verbs));
ck('every circle is a chip', P('home').chips === 4, String(P('home').chips));
ck('the question waiting for YOUR answer links to its own token', /respond\.html\?t=tok1$/.test(P('home').answer || ''), P('home').answer);
ck('your three open questions are cards', P('home').qcards === 3, String(P('home').qcards));
ck('what people shared is listed', P('home').feed === 2, String(P('home').feed));
ck('the three counters are gone', P('home').stats === 0);
ck('the Taste Match banner is gone from Home', P('home').taste === false);

console.log('\n== 4. the menu reaches what a phone could not ==\n');
['history', 'answered', 'taste-match', 'settings', 'profile'].forEach((v) => {
  ck('menu reaches ' + v, (P('menu').views || []).indexOf(v) > -1, JSON.stringify(P('menu').views));
});
ck('...and signs out', P('menu').signout === 1);
ck('the plus offers save and recommend, not ask', P('fab').save === 1 && P('fab').rec === 1 && P('fab').ask === 0, JSON.stringify(P('fab')));

console.log('\n== 5. paste a number, for someone who will never join ==\n');
ck('Add friends offers Paste a number', P('add-member').paste === 1);
const digits = String(P('paste-ok').phone || '').replace(/\D/g, '');
ck('a pasted number, invisible marks and all, lands in the number box', digits.slice(-9) === '528114460', JSON.stringify(P('paste-ok').phone));
ck('...with the country it belongs to', P('paste-ok').country === 'IL', P('paste-ok').country);
ck('...said back to you the way you would write it', /052-811-4460/.test(P('paste-ok').note || ''), P('paste-ok').note);
ck('...with why they never have to join', /never have to join/.test(P('paste-ok').note || ''));
ck('...and the cursor waiting in the name', P('paste-ok').focus === 'nm-name', P('paste-ok').focus);
ck('it opens the SAME form as adding someone new', P('paste-ok').form === 'block', P('paste-ok').form);
ck('if the phone will not share the clipboard, it says how to paste by hand', /Press and hold/.test(P('paste-refused').note || ''), P('paste-refused').note);
ck('...and puts the cursor in the number box', P('paste-refused').focus === 'nm-phone', P('paste-refused').focus);

console.log('\n== 6. the Ask screen works, not just draws ==\n');
ck('Degree 2 can be chosen - the listener is attached', P('query').degree === 2, String(P('query').degree));
ck('...and the list says you cannot pick people at degree 2', P('query').who === 'none', String(P('query').who));
ck('the title names the verb', P('query').title === 'Ask', P('query').title);
ck('switching to Recommend and back keeps what you typed', P('query-draft').draft === 'Where to eat in Lecce', JSON.stringify(P('query-draft').draft));
ck('...and the title follows the verb', P('query-draft').midTitle === 'Recommend', P('query-draft').midTitle);

console.log('\n== 7. the other screens, used ==\n');
ck('Library is rows', P('library').rows === 7, String(P('library').rows));
ck('Circles is one row per circle, no old cards', P('circles').rows === 4 && P('circles').cards === 0, JSON.stringify(P('circles')));
ck('a circle shows its people as faces, plus Add', P('circle').faces === 6 && P('circle').add === 1, JSON.stringify(P('circle')));
ck('...both verbs', P('circle').pair === 2);
ck('...and the way back in the top bar', /Circles/.test(P('circle').back || ''), P('circle').back);
ck('Inbox offers exactly one live Answer', P('inbox').live === 1, String(P('inbox').live));
ck('...filters by kind', P('inbox').chips === 4 && P('inbox').answers === 5, JSON.stringify(P('inbox')));
ck('the Save sheet offers every circle and none', P('add-rec').opts === 5, String(P('add-rec').opts));
ck('...picking a circle and switching send on says who it goes to', P('add-rec').chosen === 'c1' && /Save and send to 4/.test(P('add-rec').label || ''), JSON.stringify(P('add-rec')));
ck('the answer sheet leads with the question', /Apulia/.test(P('sheet').q || ''), P('sheet').q);
ck('...one row per thing, Save on the ones not yet yours', P('sheet').items === 4 && P('sheet').save === 3, JSON.stringify(P('sheet')));
ck('sign in is one page, email one line under it', /Sign in/.test(P('login').h || '') && P('login').alt === 1, JSON.stringify(P('login')));
ck('an invitation is the page: who asked, which circle', /Tom is inviting you to their Travel circle/.test(P('login-invite').h || ''), P('login-invite').h);
ck('...one button, and no sign-in form', P('login-invite').btn === 1 && P('login-invite').form === 'none', JSON.stringify(P('login-invite')));

console.log('\n== 9. v0.95.1: buttons that look like buttons, actions you can reach ==\n');
ck('Home: "Ask your circles" is a button that sets Ask', (P('home').verbs || []).indexOf('Ask your circles|ask') > -1, JSON.stringify(P('home').verbs));
ck('...beside a Recommend button that sets Recommend', (P('home').verbs || []).indexOf('Recommend|recommend') > -1);
ck('...and no grey box pretending to be a text field', P('home').ask === 0, String(P('home').ask));
ck('the circles under them are outlined, so Ask is the one solid green', P('home').chipBg === 'rgb(255, 255, 255)', P('home').chipBg);
ck("a circle's own actions open from a ... on screen by its name", P('circle').more === true, String(P('circle').more));
ck('...and nothing is left at the foot of the page', P('circle').bottom === 0, String(P('circle').bottom));
['open-circle-link', 'open-invite', 'open-modal:edit-circle', 'circle-more-delete'].forEach(function (a) {
  ck('...the sheet offers ' + a, (P('circle-more').acts || []).indexOf(a) > -1, JSON.stringify(P('circle-more').acts));
});
ck('Ask: Send is on screen without scrolling', P('query').send === true, String(P('query').send));
ck('[precondition] the item really has a long list of recommendations', P('rec-detail').recs >= 5, String(P('rec-detail').recs));
ck('an item: Mark visited / Save for later / Dismiss are on screen without scrolling', P('rec-detail').status === true, String(P('rec-detail').status));
// GUARD, NOT A FIX: Profile was already fine, and this passes on --old2 on
// purpose. It is here so the rule dan set - an action at the bottom must be
// on screen - stays true of Profile too.
ck('[guard] Profile: Save changes is on screen without scrolling', P('profile').save === true, String(P('profile').save));

console.log('\n== 8. the source ==\n');
const html = fs.readFileSync(FILE, 'utf8');
const names = (html.match(/^(?:async )?function [A-Za-z0-9_]+\(/gm) || []).map((x) => x.replace('async ', ''));
const dup = names.filter((x, i) => names.indexOf(x) !== i);
ck('no function is declared twice - the later one silently wins', !dup.length, dup.join(', '));
ck('no external font is loaded', !/fonts\.googleapis\.com/.test(html));

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
