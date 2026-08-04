// enrichment-sim.js — ONE enrichment path, or the catalogue rots again.
//
// HISTORY THIS GUARDS AGAINST: classify-rec and the librarian both owned
// ai_tags, primary_category and embedding, embedding DIFFERENT text. The
// whatsapp webhook grew a THIRD embedding format. Chat-import wrote nothing
// at all. Result: items that looked classified and were invisible to search
// (5 in production, 31 Jul 2026), plus 7 stale docs from unfired re-commits.
const vm = require('vm'); const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const F = '/home/claude/fx-out/supabase/functions/';
const core = fs.readFileSync(F + '_shared/enrich_core.ts', 'utf8');
const lib  = fs.readFileSync(F + 'librarian/index.ts', 'utf8');
const chat = fs.readFileSync(F + 'extract-chat-recs/index.ts', 'utf8');
const hook = fs.readFileSync(F + 'whatsapp-webhook/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── 1. classify-rec is dead and must stay dead ──────────────────────────────
ck('the app never CALLS classify-rec (comments naming the dead system are memory, not risk)',
   web.indexOf("fnPost('classify-rec'") < 0);
ck('classify-rec source is gone from the functions dir',
   !fs.existsSync(F + 'classify-rec'));

// ── 2. exactly ONE commit call site in the client ───────────────────────────
// count CALL SITES (line-initial payload keys), not comment mentions
const commits = (web.match(/^\s+mode: 'commit', canonical_id/gm) || []).length;
ck("exactly one \"mode: 'commit'\" in the client (the choke point)",
   commits === 1, 'found ' + commits);
ck('librarianCommit exists', web.indexOf('function librarianCommit') >= 0);
ck('requestClassify kept its name and signature (5 call sites depend on it)',
   /function requestClassify\(canonicalId, note, context\)/.test(web));

// ── 3. every mutating path reaches the choke point ──────────────────────────
const fnBody = (name) => {
  const i = web.indexOf('function ' + name);
  if (i < 0) return '';
  const j = web.indexOf('\nasync function ', i + 10);
  const k = web.indexOf('\nfunction ', i + 10);
  const end = Math.min(j < 0 ? web.length : j, k < 0 ? web.length : k);
  return web.slice(i, end);
};
[['handleSaveRec', 'requestClassify'], ['handleSaveFromFeed', 'requestClassify'],
 ['handleSaveFromSheet', 'librarianCommit'], ['handleConfirmSaveToLibrary', 'librarianCommit'],
 ['handleSaveEditRec', 'librarianCommit'], ['handleTriageAssign', 'librarianCommit'],
].forEach(([f, via]) => ck(f + ' → ' + via, fnBody(f).indexOf(via) >= 0));
ck('edit-rec re-commits with FORCE (its doc exists but is stale)',
   /librarianCommit\(rec\.canonicalId, \{ force: true/.test(fnBody('handleSaveEditRec')));
ck('triage re-commits with FORCE and the NEW circle name (the Avoriaz case)',
   /force: true[\s\S]{0,80}circleName: circle\.name/.test(fnBody('handleTriageAssign')));

// ── 4. the gate is the DOCUMENT, not the category ───────────────────────────
ck('client loads search_doc presence from the DB', web.indexOf('hasSearchDoc:!!c.search_doc') >= 0);
ck('gate: bail when the doc exists (unless forced)',
   /if \(can\.hasSearchDoc && !opts\.force\) return/.test(web));
ck('gate is NOT the old category check (it stranded 5 items)',
   !/if \(!can \|\| can\.primaryCategory \|\| can\._classifying\) return/.test(web));
ck('classified-but-unindexed items self-heal on view',
   /can\.primaryCategory && !can\.hasSearchDoc && !can\._classifyFailed/.test(web));

// ── 5. the server core is extracted, not copied ─────────────────────────────
ck('_shared/enrich_core.ts exports buildSearchDoc', /export function buildSearchDoc/.test(core));
ck('buildSearchDoc exists in exactly ONE file',
   [core, lib, chat, hook].filter(s => /function buildSearchDoc/.test(s)).length === 1);
ck('the doc still contains circle and note (the whole point)',
   /"circle: " \+ e\.circle_name/.test(core) && /e\.note,/.test(core));
ck('librarian imports the core', /from "\.\.\/_shared\/enrich_core\.ts"/.test(lib));
ck('librarian defines no local enrichment (no drift possible)',
   !/function aiEnrich|function buildSearchDoc|function enrichOne/.test(lib));
ck('extract-chat-recs writes search_doc at birth', /search_doc: searchDoc/.test(chat));
ck('extract-chat-recs embeds THE DOCUMENT', /await embed\(key, searchDoc\)/.test(chat));
ck('extract-chat-recs puts the circle name into the doc', /circle_name: circleName/.test(chat));
ck('webhook writes search_doc at birth', /canInsert\.search_doc = searchDoc/.test(hook));
ck('webhook embeds THE DOCUMENT (third format eliminated)',
   /await embedDoc\(key, searchDoc\)/.test(hook) && hook.indexOf('input: [name, location, note') < 0);
ck('exactly one embeddings call remains in the webhook (its extractor keeps none)',
   (hook.match(/openai\.com\/v1\/embeddings/g) || []).length === 0);

// ── 6. behavior: the choke point through the harness ────────────────────────
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={librarianCommit,requestClassify,handleTriageAssign,AppState};';
const calls = [];
const el = () => ({ value: '', style: {}, dataset: {}, textContent: '', innerHTML: '',
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  addEventListener(){}, appendChild(){}, remove(){}, focus(){},
  querySelector: () => null, querySelectorAll: () => [] });
const ctx = { console: { log(){}, error(){}, warn(){} },
  setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout(){},
  setInterval: () => 1, clearInterval(){},
  document: { getElementById: () => el(), createElement: () => el(), querySelector: () => null,
    querySelectorAll: () => [], addEventListener(){}, removeEventListener(){},
    body: el(), documentElement: el(), hidden: false, visibilityState: 'visible' },
  window: { addEventListener(){}, innerWidth: 390, innerHeight: 664,
    visualViewport: { height: 664, offsetTop: 0, addEventListener(){} },
    location: { href: 'x', search: '', hash: '', origin: 'x' },
    matchMedia: () => ({ matches: false, addEventListener(){} }) },
  location: { href: 'x', search: '', hash: '', origin: 'x' },
  navigator: { userAgent: 'sim', language: 'en' },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  crypto: { randomUUID: () => 'u', subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, AbortController, confirm: () => true, alert(){}, prompt(){},
  history: { replaceState(){}, pushState(){} } };
ctx.supabase = { createClient: () => ({
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  auth: { onAuthStateChange(){}, getSession: async () => ({ data: { session: null } }) },
  rpc: async () => ({ data: [] }), channel: () => ({}) }) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(app, ctx, { filename: 'app.js' });
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";'
  + 'fnPost=function(fn,body){globalThis.__calls.push({fn:fn,body:body});'
  + 'return Promise.resolve({entity:{name:body.name,category:"travel",tags:["ski"],search_doc:"doc"}});};', ctx);
ctx.__calls = calls;
const X = ctx.__x;
X.AppState.isDemoMode = false;
X.AppState.userProfile = { id: 'me', name: 'Dan' };
X.AppState.userCanonicals = [
  { id: 'c-new', name: 'Avoriaz 1800', location: '', hasSearchDoc: false },
  { id: 'c-done', name: 'Refuge de la Traye', location: '', hasSearchDoc: true },
];
X.AppState.userRecs = [
  { id: 'r1', canonicalId: 'c-new', circleId: 'ski1', note: 'great for kids' },
  { id: 'r2', canonicalId: 'c-done', circleId: 'ski1', note: 'fondue' },
];
X.AppState.userCircles = [{ id: 'ski1', name: 'ski' }];

(async () => {
  // un-indexed item → commit fires, with circle and note
  await X.requestClassify('c-new', 'great for kids', 'where to ski with kids?');
  ck('new item: exactly one librarian commit fired',
     calls.length === 1 && calls[0].fn === 'librarian' && calls[0].body.mode === 'commit',
     JSON.stringify(calls.map(c => c.fn)));
  ck('...carrying the circle name', calls[0] && calls[0].body.circle_name === 'ski');
  ck('...and the note', calls[0] && calls[0].body.note === 'great for kids');
  ck('...and local state now shows a doc (no refire loop)',
     X.AppState.userCanonicals[0].hasSearchDoc === true);

  // indexed item, no force → gate holds
  calls.length = 0;
  await X.requestClassify('c-done', 'fondue', '');
  ck('indexed item: gate blocks a needless recommit', calls.length === 0);

  // force → gate opens (this is what edit/triage use)
  await X.librarianCommit('c-done', { force: true, note: 'fondue', circleName: 'ski' });
  ck('force: true reopens the gate for stale-doc repair', calls.length === 1);

  // triage: filing to a circle re-commits with the NEW circle name
  calls.length = 0;
  X.AppState.circleById = (id) => X.AppState.userCircles.find(c => c.id === id) || null;
  await X.handleTriageAssign({ dataset: { recId: 'r2', circleId: 'ski1' }, disabled: false });
  const tc = calls.find(c => c.fn === 'librarian');
  ck('triage-assign fires a forced recommit with the circle name',
     !!tc && tc.body.circle_name === 'ski' && tc.body.mode === 'commit',
     JSON.stringify(calls));

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
})();
