// circle-interest-seed-sim.js — a circle named "ski" is about skiing.
//
// THE FAILURE, measured 24 Aug 2026: dan had two circles named "ski", one
// described "resorts, equipment", and NEITHER had a single circle_interests
// row. The suggestion sweep matches only rows with source='confirmed', so a
// member's ski recommendation could never reach him — and the only thing on
// screen was a grey link reading "Set what this circle is about", which said
// nothing about what it cost to ignore it.
//
//   recipient_confirmed_interests: 0
//   circle "ski"   interest null   source null
//   circle "italy" interest null   source null
//
// The owner naming their OWN circle is a statement about their own circle.
// That is NOT the product law "circles are provenance, not evidence", which is
// about never classifying someone ELSE'S item by the folder they filed it in.
// That law is untouched here and is asserted below.
//
//   node circle-interest-seed-sim.js         → web/index.html, must PASS
//   node circle-interest-seed-sim.js --old   → index.pre-v0.73.1.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.73.1.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState, interestsForKind,'
     + ' seed: (typeof seedCircleInterestsFromNames === "function")'
     + '        ? seedCircleInterestsFromNames : null };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let inserted = [];        // rows handed to circle_interests.insert
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
    insert: async (rows) => { if (table === 'circle_interests') inserted = inserted.concat(rows);
      return failNext ? { error: { message: 'refused', code: '42501' } } : { error: null }; },
    upsert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    select: () => ({ eq: () => ({ order: async () => ({ data:[], error:null }) }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  auth: { onAuthStateChange(){}, getSession: async () => ({ data:{ session:null } }) },
  rpc: async () => ({ data:null, error:null }), channel: () => ({ on(){ return this; }, subscribe(){} }),
})};
ctx.window.supabase = ctx.supabase;
ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};'
    + 'CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  console.log('\n── the vocabulary reads the circle name ──\n');
  ck('"ski" + "resorts, equipment" derives the ski interest',
     X.interestsForKind('ski resorts, equipment').indexOf('ski') > -1,
     JSON.stringify(X.interestsForKind('ski resorts, equipment')));
  ck('a name matching nothing derives nothing',
     X.interestsForKind('Tuesday people').length === 0,
     JSON.stringify(X.interestsForKind('Tuesday people')));

  console.log('\n── the seeding itself ──\n');
  if (!X.seed) {
    ck('seedCircleInterestsFromNames exists', false, 'function not present');
    console.log('\n  ' + (useOld ? 'BASELINE v0.73.0 (must FAIL)' : 'PATCHED') + ': '
      + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }
  ck('seedCircleInterestsFromNames exists', true);

  X.AppState.isDemoMode = false;
  X.AppState.dataLoadFailed = false;
  X.AppState.userCircles = [
    { id: 'c-ski',   name: 'ski',            description: 'resorts, equipment' },
    { id: 'c-italy', name: 'italy',          description: '' },
    { id: 'c-odd',   name: 'Tuesday people', description: '' },
    { id: 'c-set',   name: 'ski',            description: 'already chosen' },
    { id: 'c-no',    name: 'ski',            description: 'owner declined' },
  ];
  X.AppState.circleInterests = [
    { circle_id: 'c-set', interest: 'book',  source: 'confirmed', terms: [], is_custom: false },
    { circle_id: 'c-no',  interest: '_none', source: 'declined',  terms: [], is_custom: false },
  ];

  inserted = [];
  const n = await X.seed();

  const forCircle = (id) => inserted.filter(r => r.circle_id === id);

  ck('a circle named "ski" is seeded', forCircle('c-ski').length > 0,
     JSON.stringify(forCircle('c-ski').map(r => r.interest)));
  ck('...with the ski interest', forCircle('c-ski').some(r => r.interest === 'ski'),
     JSON.stringify(forCircle('c-ski').map(r => r.interest)));
  ck('...marked confirmed, which is the only source the sweep matches',
     forCircle('c-ski').every(r => r.source === 'confirmed'),
     JSON.stringify(forCircle('c-ski').map(r => r.source)));
  ck('...and owned by the caller', forCircle('c-ski').every(r => r.owner_id === 'dan'));

  ck('a name matching nothing is left for the picker', forCircle('c-odd').length === 0,
     JSON.stringify(forCircle('c-odd')));

  ck('NEG · a circle whose owner already chose is NOT overridden',
     forCircle('c-set').length === 0, JSON.stringify(forCircle('c-set')));
  ck('NEG · a circle whose owner DECLINED is NOT overridden',
     forCircle('c-no').length === 0, JSON.stringify(forCircle('c-no')));

  console.log('\n── it must not run twice ──\n');
  inserted = [];
  await X.seed();
  ck('a second pass writes nothing (state was updated in memory)',
     inserted.length === 0, JSON.stringify(inserted.map(r => r.circle_id)));

  console.log('\n── the product law is untouched ──\n');
  // Circles are provenance for the CONTRIBUTOR'S item: the librarian must never
  // be told which circle something was filed in. Guarded in enrichment-sim too;
  // asserted here because this change is the one that could be misread as
  // licence to send it.
  // The client may still SEND circle_name; the librarian must not read it into
  // the enrichment input. Asserted where the law is enforced, not where it is
  // ignored - the first version of this check looked at the client and failed
  // for the wrong reason.
  const libSrc = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'librarian', 'index.ts'), 'utf8');
  const inputBlock = libSrc.slice(libSrc.indexOf('const input = {'),
                                  libSrc.indexOf('};', libSrc.indexOf('const input = {')));
  ck('the librarian never reads a circle name into its enrichment input',
     inputBlock.length > 0 && !/^\s*circle_name\s*:/m.test(inputBlock),
     inputBlock.length ? 'ok-block' : 'input block not found');

  console.log('\n── a refused write is never silent ──\n');
  X.AppState.circleInterests = [];
  X.AppState.userCircles = [{ id: 'c-ski2', name: 'ski', description: '' }];
  failNext = true;
  inserted = [];
  const n2 = await X.seed();
  ck('a refused insert is not counted as seeded', n2 === 0, String(n2));
  failNext = false;

  console.log('\n  ' + (useOld ? 'BASELINE v0.73.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
