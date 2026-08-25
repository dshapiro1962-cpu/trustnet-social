// suggestion-filing-sim.js — one column, two meanings.
//
// THE FAILURE, measured on production 25 Aug 2026. A Tel Aviv coffee shop sent
// directly by dan test2 produced a native browser prompt reading:
//
//   This matches 3 of your circles:
//   1. skiing  2. test  3. karate
//   Which one? (number)  [1]
//
// It matched none of them. `matched_circles` means two different things:
//
//   * suggest-sweep writes circles whose CONFIRMED INTEREST matched the kind
//   * 0031's direct-send RPC writes every circle of yours the SENDER is in
//     (`where m3.owner_id = <you> and m3.linked_user_id = <sender>`)
//
// The UI asserted the first meaning for both, and defaulted to
// matched_circles[0] — so pressing OK filed a café under skiing.
//
//   node suggestion-filing-sim.js         → web/index.html, must PASS
//   node suggestion-filing-sim.js --old   → index.pre-v0.74.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.74.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState,'
     + ' opts: (typeof suggestionFilingOptions === "function") ? suggestionFilingOptions : null,'
     + ' modal: (typeof modalFileSuggestion === "function") ? modalFileSuggestion : null,'
     + ' file: (typeof handleFileSuggestion === "function") ? handleFileSuggestion : null };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let inserted = [];       // rows handed to recommendations.insert
let promptCalls = 0;

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
  confirm: () => true, alert(){},
  // THE POINT OF THE CONTROL: the old code reaches for this.
  prompt: () => { promptCalls++; return '1'; },
  atob: s => Buffer.from(s,'base64').toString('binary'),
  btoa: s => Buffer.from(s,'binary').toString('base64'),
  history: { replaceState(){}, pushState(){} },
};
ctx.supabase = { createClient: () => ({
  from: (table) => ({
    insert: async (rows) => { if (table === 'recommendations') inserted.push(rows);
      return { error: null, data: null }; },
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
    + 'closeModal=function(){};loadUserData=async function(){};'
    + 'shareDefault=function(){return true;};CURRENT_UID="shapiro";', ctx);
  const X = ctx.__x;

  // dshapiro3012's circles as they actually stand: only karate has a confirmed
  // interest, and it is a custom one about martial arts.
  X.AppState.userCircles = [
    { id: 'c-ski',    name: 'skiing' },
    { id: 'c-test',   name: 'test' },
    { id: 'c-karate', name: 'karate' },
    { id: 'c-hood',   name: 'neighbourhood' },
  ];
  X.AppState.circleInterests = [
    { circle_id: 'c-karate', interest: 'karate in israel', source: 'confirmed', is_custom: true,
      terms: ['dojo', 'karate school'] },
  ];
  X.AppState.people = [];
  X.AppState.userCanonicals = [];

  const cafe = { id: 'can-cafe', name: 'Caffe Tamati', kind: 'coffee shop בית קפה',
                 location: 'Tel Aviv' };
  const sgDirect = { id: 'sg1', canonical_id: 'can-cafe', canonicals: cafe, via: 'direct',
                     from_name: 'dan test2', from_user_id: 'u-dt2', from_person_id: null,
                     source_note: 'great coffee', status: 'pending',
                     matched_circles: ['c-ski', 'c-test', 'c-karate'],
                     matched_interest: 'sent to you directly' };

  console.log('\n── the code must exist at all ──\n');
  // The modal looks the suggestion up by id, so it must be in state before
  // any of these calls. The first version of this sim set it halfway down and
  // the panel correctly returned "that suggestion is no longer here" - four
  // failures that were the sim's fault, not the code's.
  X.AppState.suggestions = [sgDirect];
  ck('suggestionFilingOptions exists', !!X.opts);
  ck('modalFileSuggestion exists', !!X.modal);
  ck('handleFileSuggestion exists', !!X.file);
  if (!X.opts || !X.modal || !X.file) {
    console.log('\n  ' + (useOld ? 'BASELINE v0.73.1 (must FAIL)' : 'PATCHED') + ': '
      + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }

  console.log('\n── the Caffe Tamati case ──\n');
  let o = X.opts(sgDirect, cafe);
  ck('no circle is claimed to FIT a cafe when none is about cafes',
     o.fitting.length === 0, JSON.stringify(o.fitting.map(c => c.name)));
  ck('the shared circles are offered as shared, not as matches',
     o.others.map(c => c.name).sort().join(',') === 'karate,skiing,test',
     JSON.stringify(o.others.map(c => c.name)));

  let h = X.modal({ sgId: 'sg1' });
  ck('the panel says who SENT it, not that it matched',
     /sent you this/.test(h) && !/matches/.test(h), h.indexOf('matches') > -1 ? 'says "matches"' : '');
  ck('...and says plainly that no circle is about this kind of thing',
     /None of your circles are about/.test(h));
  ck('...and offers Save unfiled with an empty circle id',
     /data-action="file-suggestion"[^>]*data-circle-id=""/.test(h));
  ck('...with no typed-number prompt anywhere', promptCalls === 0, String(promptCalls));

  console.log('\n── a circle that genuinely fits ──\n');
  X.AppState.circleInterests.push(
    { circle_id: 'c-hood', interest: 'cafe', source: 'confirmed', is_custom: false, terms: [] });
  o = X.opts(sgDirect, cafe);
  ck('a circle whose confirmed interest covers "coffee shop" is FITTING',
     o.fitting.length === 1 && o.fitting[0].id === 'c-hood',
     JSON.stringify(o.fitting.map(c => c.name)));
  ck('...even though the sender is not a member of it',
     (sgDirect.matched_circles || []).indexOf('c-hood') < 0);
  ck('...and it is not repeated in the shared list',
     o.others.every(c => c.id !== 'c-hood'), JSON.stringify(o.others.map(c => c.name)));

  h = X.modal({ sgId: 'sg1' });
  ck('the panel leads with the fitting circle', /FITS THIS CIRCLE/.test(h));

  console.log('\n── a swept suggestion says something different ──\n');
  const sgSweep = Object.assign({}, sgDirect, { id: 'sg2', via: 'save',
    matched_circles: ['c-hood'], matched_interest: 'cafe' });
  X.AppState.suggestions = [sgDirect, sgSweep];
  h = X.modal({ sgId: 'sg2' });
  ck('a swept suggestion says it matched, because there it did',
     /matches what one of your circles is about/.test(h));

  console.log('\n── filing never guesses ──\n');
  X.AppState.suggestions = [sgDirect, sgSweep];
  inserted = [];
  await X.file('sg1', null);
  ck('Save unfiled writes circle_id null, not matched_circles[0]',
     inserted.length === 1 && inserted[0].circle_id === null,
     JSON.stringify(inserted.map(r => r.circle_id)));

  inserted = [];
  await X.file('sg1', 'c-hood');
  ck('choosing a circle files it there',
     inserted.length === 1 && inserted[0].circle_id === 'c-hood',
     JSON.stringify(inserted.map(r => r.circle_id)));
  ck('...and it still carries the sharing preference',
     inserted[0].shared_to_network === true);

  console.log('\n── the native prompt is gone from this path ──\n');
  ck('no prompt() was ever reached', promptCalls === 0, String(promptCalls));
  ck('the accept path contains no prompt( call',
     !/prompt\('This matches/.test(src));

  console.log('\n  ' + (useOld ? 'BASELINE v0.73.1 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
