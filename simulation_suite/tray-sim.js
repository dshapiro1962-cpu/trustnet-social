// tray-sim.js — v0.14.0 triage tray simulation (12 checks)
const vm = require('vm');
const fs = require('fs');

let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
src += ';globalThis.__x = { renderTriageTray, suggestedCircleFor, renderLibrary, recCardHtml, handleTriageAssign, AppState, APP_VERSION };';

const toasts = [];
const el = (over) => Object.assign({
  value: '', style: {}, dataset: {}, innerHTML: '', className: '', textContent: '',
  addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
  closest() { return null; }, classList: { add() {}, remove() {}, toggle() {} },
}, over || {});

// chainable, awaitable supabase stub
function makeChain(ctx) {
  const fn = function () {};
  const p = new Proxy(fn, {
    get(_t, k) {
      if (k === 'then') return (resolve) => resolve(ctx.__sbResult || { data: [], error: null });
      return (...a) => { ctx.__sbCalls.push([k, a]); return p; };
    },
    apply() { return p; },
  });
  return p;
}

const ctx = {
  console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => el(), addEventListener() {}, removeEventListener() {}, body: el(), documentElement: el(), head: el(),
    hidden: false, visibilityState: 'visible' },
  window: { supabase: null, addEventListener() {}, location: { href: 'https://x', search: '', hash: '', origin: 'https://x' }, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  location: { href: 'https://x', search: '', hash: '', origin: 'https://x' },
  navigator: { userAgent: 'sim', language: 'en' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  crypto: { randomUUID: () => 'uuid-sim', subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, AbortController,
  confirm: () => true, alert() {}, prompt: () => null,
  history: { replaceState() {}, pushState() {} },
  __sbCalls: [], __sbResult: { data: [], error: null },
};
ctx.supabase = { createClient: () => ({ from: () => makeChain(ctx), auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }) }, rpc: () => makeChain(ctx), channel: () => ({}) }) };
ctx.window.supabase = ctx.supabase;
ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp = function(){};'
    + 'toast = function(m,t){ globalThis.__toasts.push([m,t||"ok"]); };', ctx);
  ctx.__toasts = toasts;
  const X = ctx.__x;

  check('APP_VERSION is v0.19.2', X.APP_VERSION === 'v0.19.2 · live', X.APP_VERSION);

  // fixtures
  X.AppState.isDemoMode = false;
  X.AppState.userCircles = [
    { id: 'c-din', name: 'Dining', domain: 'dining', color: '#217A4B' },
    { id: 'c-trv', name: 'Travel', domain: 'travel', color: '#2B5FA3' },
  ];
  X.AppState.userCanonicals = [
    { id: 'k1', name: 'Hummus HaCarmel', location: 'Tel Aviv', primaryCategory: 'dining', imageEmoji: '🍽️', imageUrl: 'https://img.example/h.jpg' },
    { id: 'k2', name: 'Some Book', primaryCategory: 'culture', imageEmoji: '📖', imageUrl: '' },
  ];
  X.AppState.userRecs = [
    { id: 'r1', canonicalId: 'k1', circleId: '', note: 'from whatsapp', sourceLabel: 'Rina \u00b7 Tel Aviv doctors' },
    { id: 'r2', canonicalId: 'k2', circleId: '', note: '' },
    { id: 'r3', canonicalId: 'k1', circleId: 'c-din', note: 'already filed' },
  ];
  X.AppState.canonicalById = (id) => X.AppState.userCanonicals.find((c) => c.id === id) || null;
  X.AppState.circleById = (id) => X.AppState.userCircles.find((c) => c.id === id) || null;
  X.AppState.allRecs = () => X.AppState.userRecs;
  X.AppState.synCircles = [];
  X.AppState.activeFilter = 'all';
  X.AppState.searchQuery = '';
  X.AppState.memberById = () => null;
  X.AppState.userProfile = { id: 'me', name: 'dan' };

  // — rendering —
  const tray = X.renderTriageTray();
  check('tray renders with count', tray.includes('NEEDS FILING') && tray.includes('2 saved without a circle'));
  check('tray shows unfiled item names', tray.includes('Hummus HaCarmel') && tray.includes('Some Book'));
  check('suggested chip: domain match, starred + labeled', tray.includes('★ Dining') && tray.includes('Suggested'));
  const hummusRow = tray.slice(tray.indexOf('Hummus'), tray.indexOf('Some Book'));
  check('suggested chip ordered first', hummusRow.indexOf('Dining') < hummusRow.indexOf('Travel'));
  check('chips carry triage-assign action', (tray.match(/data-action="triage-assign"/g) || []).length === 4);
  check('thumbnail used when image_url present', tray.includes('img.example/h.jpg'));
  check('no tinder-swipe anywhere', !tray.toLowerCase().includes('swipe'));
  check('imported items announce their list', tray.includes('From Rina') && tray.includes('Tel Aviv doctors'));

  const sug = X.suggestedCircleFor({ primaryCategory: 'travel' });
  check('suggestedCircleFor matches circle domain', sug && sug.id === 'c-trv');

  check('library embeds tray', X.renderLibrary().includes('triage-tray'));

  const card = X.recCardHtml({ id: 'r3', canonicalId: 'k1', circleId: 'c-din', tags: [], status: 'saved' }, false);
  check('rec card uses image thumbnail', card.includes('background-image') && card.includes('img.example/h.jpg'));

  // — assign handler: success —
  const btn = el({ dataset: { recId: 'r1', circleId: 'c-din' } });
  ctx.__btn1 = btn;
  ctx.__sbResult = { data: null, error: null };
  await vm.runInContext('handleTriageAssign(__btn1)', ctx);
  const r1 = X.AppState.userRecs.find((r) => r.id === 'r1');
  check('assign ok: rec filed + update called + toast', r1.circleId === 'c-din'
    && ctx.__sbCalls.some((c) => c[0] === 'update' && c[1][0] && c[1][0].circle_id === 'c-din')
    && toasts.some((t) => t[0] === 'Filed to Dining.'));

  // — assign handler: failure reverts with verbatim error —
  const btn2 = el({ dataset: { recId: 'r2', circleId: 'c-trv' } });
  ctx.__btn2 = btn2;
  ctx.__sbResult = { data: null, error: { message: 'rls_denied_23503' } };
  await vm.runInContext('handleTriageAssign(__btn2)', ctx);
  const r2 = X.AppState.userRecs.find((r) => r.id === 'r2');
  check('assign fail: reverted + verbatim error toast', r2.circleId === ''
    && toasts.some((t) => String(t[0]).includes('rls_denied_23503')));

  console.log('\nRESULT:', pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
