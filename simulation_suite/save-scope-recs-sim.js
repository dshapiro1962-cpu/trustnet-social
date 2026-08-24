// save-scope-recs-sim.js — one save writes the rows the caller NAMED.
//
// The sibling sim (save-scope-sim.js) asserts `length === 1` for saveCanonicals.
// That invariant is wrong for recommendations: handleDeleteCircle legitimately
// re-points many recs in one call. So the assertion here is EQUALITY WITH THE
// CALLER'S LIST — a sim that only counted rows would pass while writing the
// wrong ones, which is the same class of mistake rls-sim.js made when it
// asserted which rows were sent and never how many.
//
//   node save-scope-recs-sim.js          → web/index.html, must PASS
//   node save-scope-recs-sim.js --old    → index.pre-v0.73.0.html, must FAIL
//
// The CONTROL matters: if --old passes, this suite is measuring nothing.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
// The patched client is read from the repo itself; the baseline is the commit
// this fix was made against. save-scope-sim.js used to point at
// simulation_suite/index.html, which has never existed in the repo, so the
// v0.72.2 guard could not be run from a clean checkout at all. Each sim names
// the baseline ITS OWN fix was made against — a shared "original" snapshot
// taken today already contains the sibling fix, and its control passes, which
// per CLAUDE.md means the suite is measuring nothing.
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.73.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) {
  console.error('missing fixture: ' + file);
  process.exit(2);
}
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { saveRecs, saveMembers, saveQueries, AppState, APP_VERSION };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let captured = null;      // rows handed to upsert
let capturedTable = null; // which table they went to
let updates = [];         // { table, id } per .update().eq()
let failNext = false;

const ctx = {
  console: { log(){}, error(){}, warn(){}, debug(){} },
  setTimeout: () => 0, clearTimeout(){}, setInterval: () => 1, clearInterval(){},
  requestAnimationFrame: () => 0,
  document: { getElementById: i => (byId[i] = byId[i] || el()), querySelectorAll: () => [],
    querySelector: () => null, createElement: () => el(), addEventListener(){},
    removeEventListener(){}, body: el(), documentElement: el(), head: el(),
    hidden:false, visibilityState:'visible', cookie:'' },
  window: { addEventListener(){}, removeEventListener(){}, supabase:null,
    location:{ href:'x', search:'', hash:'', origin:'x', pathname:'/' },
    matchMedia: () => ({ matches:false, addEventListener(){} }), scrollTo(){} },
  location: { href:'x', search:'', hash:'', origin:'x', pathname:'/' },
  navigator: { userAgent:'sim', language:'en', onLine:true },
  localStorage: { getItem:()=>null, setItem(){}, removeItem(){}, key:()=>null, length:0 },
  sessionStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
  fetch: async () => ({ ok:true, status:200, json: async () => ({}) }),
  crypto: { randomUUID: () => 'u' + Math.random().toString(16).slice(2),
            subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, TextDecoder, AbortController, URL,
  confirm: () => true, alert(){}, prompt(){}, atob: s => Buffer.from(s,'base64').toString('binary'),
  btoa: s => Buffer.from(s,'binary').toString('base64'),
  history: { replaceState(){}, pushState(){} },
};
ctx.supabase = { createClient: () => ({
  from: (table) => ({
    upsert: async (rows) => { captured = rows; capturedTable = table;
      return failNext ? { error:{ message:'permission denied', code:'42501' } } : { error:null }; },
    update: () => ({ eq: async (_col, id) => { updates.push({ table, id });
      return failNext ? { error:{ message:'refused', code:'42501' } } : { error:null }; } }),
    select: () => ({ eq: () => ({ order: async () => ({ data:[], error:null }) }) }),
    delete: () => ({ eq: () => ({ in: async () => ({ error:null }) }) }),
  }),
  auth: { onAuthStateChange(){}, getSession: async () => ({ data:{ session:null } }) },
  rpc: async () => ({ data:null, error:null }), channel: () => ({ on(){ return this; }, subscribe(){} }),
})};
ctx.window.supabase = ctx.supabase;
ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const ck = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== undefined ? '   ' + detail : '')); }
};
const idsOf = rows => (rows || []).map(r => r.id).sort().join(',');

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};'
    + 'CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  // A library shaped like dan's: 95 recs. One of them carries a circle that has
  // been deleted on another device — the live poison vector. Its circle_id is a
  // foreign key, so including it in an upsert refuses the WHOLE statement.
  const recs = [];
  for (let i = 0; i < 94; i++) recs.push({ id:'r'+i, canonicalId:'c'+i, circleId:'live-circle', note:'n'+i });
  recs.push({ id:'poison', canonicalId:'cp', circleId:'DELETED-CIRCLE', note:'stale' });
  X.AppState.userRecs = recs;
  X.AppState.userMembers = [{ id:'m1', name:'A', circleId:'live-circle', contactValue:'+972500000001' },
                            { id:'m2', name:'B', circleId:'live-circle', contactValue:'+972500000002' }];
  X.AppState.userQueries = [];
  X.AppState.dataLoadFailed = false;

  console.log('  library: ' + recs.length + ' recs, 1 pointing at a deleted circle\n');

  // ── saveRecs ────────────────────────────────────────────────────────────
  captured = null;
  await X.saveRecs(['r7']);
  ck('one named rec writes exactly one row', captured && captured.length === 1,
     captured ? 'wrote ' + captured.length : 'wrote nothing');
  ck('and it is the row that was named', idsOf(captured) === 'r7', idsOf(captured));
  ck('it goes to the recommendations table', capturedTable === 'recommendations', capturedTable);

  captured = null;
  await X.saveRecs(['r1','r2','r3']);
  ck('three named recs write exactly those three', idsOf(captured) === 'r1,r2,r3', idsOf(captured));

  // THE ONE THAT MATTERS. A stale circle on an unrelated row must not be able
  // to refuse this write, because it must not be IN this write.
  captured = null;
  let threw = false;
  try { await X.saveRecs(['r7']); } catch (e) { threw = true; }
  ck('a rec with a dead circle_id is not dragged into an unrelated save',
     !threw && captured.length === 1 && !captured.some(r => r.id === 'poison'),
     idsOf(captured));

  // handleDeleteCircle: many rows, all named. The invariant is the caller's
  // list, NOT "exactly one" — a sim asserting 1 here would forbid a correct call.
  captured = null;
  await X.saveRecs(['r1','r2','r3','r4','r5']);
  ck('a legitimate multi-row caller writes all five and no more',
     captured && captured.length === 5 && idsOf(captured) === 'r1,r2,r3,r4,r5', idsOf(captured));

  captured = null;
  await X.saveRecs('r9');
  ck('a bare id (not an array) is accepted', idsOf(captured) === 'r9', idsOf(captured));

  captured = null;
  await X.saveRecs(['nope']);
  ck('an id that is not in memory writes nothing', captured === null || captured.length === 0);

  failNext = true; threw = false;
  try { await X.saveRecs(['r7']); } catch (e) { threw = true; }
  ck('a refused write still THROWS', threw);
  failNext = false;

  threw = false;
  try { await X.saveRecs(); } catch (e) { threw = true; }
  ck('NEG · a bare call throws instead of writing the whole library', threw);

  captured = null;
  await X.saveRecs([]);
  ck('NEG · an empty list writes nothing', captured === null);

  // ── saveMembers ─────────────────────────────────────────────────────────
  captured = null;
  await X.saveMembers(['m1']);
  ck('saveMembers writes only the named member',
     captured && captured.length === 1 && captured[0].id === 'm1',
     captured ? idsOf(captured) : 'nothing');

  threw = false;
  try { await X.saveMembers(); } catch (e) { threw = true; }
  ck('NEG · saveMembers bare call throws', threw);

  failNext = true; threw = false;
  try { await X.saveMembers(['m1']); } catch (e) { threw = true; }
  ck('saveMembers THROWS on refusal (it used to warn and return normally)', threw);
  failNext = false;

  // ── saveQueries ─────────────────────────────────────────────────────────
  updates = [];
  await X.saveQueries(['resp-1']);
  ck('saveQueries issues exactly one statement for one response',
     updates.length === 1 && updates[0].id === 'resp-1',
     JSON.stringify(updates));

  updates = [];
  await X.saveQueries(['resp-1','resp-2']);
  ck('saveQueries issues one statement per named response', updates.length === 2,
     String(updates.length));

  threw = false;
  try { await X.saveQueries(); } catch (e) { threw = true; }
  ck('NEG · saveQueries bare call throws', threw);

  // ── the load-failure guard must survive all of this ─────────────────────
  X.AppState.dataLoadFailed = true;
  threw = false; captured = null;
  try { await X.saveRecs(['r7']); } catch (e) { threw = true; }
  ck('a failed load still refuses to write', threw && captured === null);
  X.AppState.dataLoadFailed = false;

  console.log('\n  ' + (useOld ? 'ORIGINAL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
