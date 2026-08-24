// save-scope-sim.js — one save writes one row.
//
// rls-sim.js (dropped after v0.65.0) mocked upsert as { error: null } and
// asserted WHICH rows were sent. It never asserted HOW MANY, so it would have
// passed happily while a single save rewrote 95 rows. This asserts the payload
// row count, and it fails on the old code.
//
//   node save-scope-sim.js            → the patched index.html
//   node save-scope-sim.js --old      → the original, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
// The patched client is read from the repo, not from a copy that was never
// committed: this pointed at simulation_suite/index.html, which has never
// existed here, so the v0.72.2 guard could not be run from a clean checkout.
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.72.2.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { saveCanonicals, AppState, APP_VERSION };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let captured = null;      // the rows handed to upsert
let failNext = false;     // simulate the database refusing

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
  from: () => ({
    upsert: async (rows) => { captured = rows;
      return failNext ? { error:{ message:'permission denied', code:'42501' } } : { error:null }; },
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

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};'
    + 'CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  // A library shaped like dan's on 23 Aug: 95 rows, one of them unwritable.
  const lib = [];
  for (let i = 0; i < 94; i++) lib.push({ id:'c'+i, name:'Place '+i, createdBy:'dan' });
  lib.push({ id:'poison', name:'Tony Vespa', createdBy:'someone-else' });
  lib.push({ id:'new1', name:'Hummus Arafat', createdBy:'dan' });
  X.AppState.userCanonicals = lib;

  console.log('  library: ' + lib.length + ' canonicals, 1 owned by another user\n');

  captured = null;
  await X.saveCanonicals('new1');
  ck('one save writes ONE row', captured && captured.length === 1,
     captured ? 'wrote ' + captured.length : 'wrote nothing');
  ck('and it is the right row', captured && captured[0] && captured[0].id === 'new1',
     captured && captured[0] ? captured[0].id : '-');
  ck("another user's row is not dragged in",
     !captured || !captured.some(r => r.id === 'poison'));

  captured = null;
  await X.saveCanonicals(['c1','c2']);
  ck('two ids write exactly two rows', captured && captured.length === 2,
     captured ? String(captured.length) : 'nothing');

  captured = null;
  await X.saveCanonicals('poison');
  ck("a row owned by someone else writes nothing, quietly",
     captured === null || captured.length === 0);

  // THE ONE THAT MATTERS: a poisoned library must not break an unrelated save.
  captured = null;
  let threw = false;
  try { await X.saveCanonicals('new1'); } catch (e) { threw = true; }
  ck('a poisoned library does not break an unrelated save', !threw && captured.length === 1);

  // A refused write must still be loud.
  failNext = true; threw = false;
  try { await X.saveCanonicals('new1'); } catch (e) { threw = true; }
  ck('a refused write still THROWS', threw);
  failNext = false;

  // NEGATIVE: calling it bare must be impossible, not silently whole-library.
  threw = false;
  try { await X.saveCanonicals(); } catch (e) { threw = true; }
  ck('NEG · a bare call throws instead of writing everything', threw);

  captured = null;
  await X.saveCanonicals([]);
  ck('NEG · an empty list writes nothing', captured === null);

  console.log('\n  ' + (useOld ? 'ORIGINAL' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
