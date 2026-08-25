// item-facts-sim.js — one item, one set of facts, wherever it is shown.
//
// MEASURED ON PRODUCTION, 25 Aug 2026. Three renderers, three different answers
// about the same row:
//
//   library card       name, can.category, location        never kind
//   suggestion card    name, can.kind                      NEVER LOCATION
//   filing modal       name, can.kind, location            location nested
//                                                          inside the kind
//                                                          conditional
//
// 146 canonicals: 77 have a location, 74 have a kind, 72 have none. So the
// suggestion card lost the location on 77 rows, and the filing modal lost it on
// every row with no kind. dan, seeing it in his inbox: "location which is in
// the library card of these items eg king david jerusalem, marietta leros
// greece, national library jerusalem."
//
// The reason they drifted: the same canonical arrives in TWO SHAPES - camelCase
// from loadUserData's mapper, raw snake_case when PostgREST embeds it in a
// suggestion row - and each renderer coped on its own.
//
//   node item-facts-sim.js         → web/index.html, must PASS
//   node item-facts-sim.js --old   → index.pre-v0.76.1.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.76.1.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState, recCardHtml, suggestionCardHtml, modalFileSuggestion,'
     + ' facts: (typeof itemFactsText === "function") ? itemFactsText : null,'
     + ' canonFacts: (typeof canonFacts === "function") ? canonFacts : null };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};

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
  localStorage: { getItem:()=>'0', setItem(){}, removeItem(){}, key:()=>null, length:0 },
  sessionStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
  fetch: async () => ({ ok:true, status:200, json: async () => ({}) }),
  crypto: { randomUUID: () => 'u' + Math.random().toString(16).slice(2),
            subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, TextDecoder, AbortController, URL,
  confirm: () => true, alert(){}, prompt(){},
  atob: s => Buffer.from(s,'base64').toString('binary'),
  btoa: s => Buffer.from(s,'binary').toString('base64'),
  history: { replaceState(){}, pushState(){} },
};
ctx.supabase = { createClient: () => ({
  from: () => ({ upsert: async()=>({error:null}), insert: async()=>({error:null}),
    update: () => ({ eq: async()=>({error:null}) }),
    select: () => ({ eq: () => ({ order: async()=>({data:[],error:null}) }) }),
    delete: () => ({ eq: () => ({ in: async()=>({error:null}) }) }) }),
  auth: { onAuthStateChange(){}, getSession: async () => ({ data:{ session:null } }) },
  rpc: async () => ({ data:true, error:null }), channel: () => ({ on(){return this;}, subscribe(){} }),
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
    + 'closeModal=function(){};CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  console.log('\n-- the shared facts line exists --\n');
  ck('itemFactsText exists', !!X.facts);
  ck('canonFacts exists', !!X.canonFacts);
  if (!X.facts || !X.canonFacts) {
    console.log('\n  ' + (useOld ? 'BASELINE v0.76.0 (must FAIL)' : 'PATCHED') + ': '
      + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }

  // The three items from dan's inbox, in the two shapes a canonical arrives in.
  const camel = { id:'k1', name:'king david hotel', kind:'hotel', location:'Jerusalem',
                  primaryCategory:'travel', websiteUrl:'' };
  const snake = { id:'k1', name:'king david hotel', kind:'hotel', location:'Jerusalem',
                  primary_category:'travel', website_url:'' };
  const noKind = { id:'k2', name:'the national library', kind:null, location:'Jerusalem',
                   primaryCategory:'other' };
  const noLoc  = { id:'k3', name:'Rossignol Forza', kind:'skis', location:'',
                   primaryCategory:'other' };

  console.log('\n-- both shapes of the same row read the same --\n');
  ck('camelCase and snake_case give the same facts',
     X.facts(camel) === X.facts(snake), X.facts(camel) + ' vs ' + X.facts(snake));
  ck('...and it names what it is and where',
     X.facts(camel) === 'hotel · Jerusalem', JSON.stringify(X.facts(camel)));
  ck('a row with no kind still shows its location',
     X.facts(noKind) === 'Jerusalem', JSON.stringify(X.facts(noKind)));
  ck('a row with no location still shows what it is',
     X.facts(noLoc) === 'skis', JSON.stringify(X.facts(noLoc)));
  ck('the OWNER\'S own words outrank the librarian\'s',
     X.facts({ name:'x', category:'coffee', kind:'cafe', location:'Tel Aviv' })
       === 'coffee · Tel Aviv',
     X.facts({ name:'x', category:'coffee', kind:'cafe', location:'Tel Aviv' }));

  console.log('\n-- EVERY renderer shows the location --\n');
  X.AppState.userCanonicals = [camel, noKind, noLoc];
  X.AppState.userRecs = [{ id:'r1', canonicalId:'k1', note:'', tags:[], status:'saved' }];
  X.AppState.userCircles = [];
  X.AppState.circleInterests = [];
  X.AppState.people = [];
  X.AppState.isDemoMode = false;

  const lib = X.recCardHtml(X.AppState.userRecs[0], true, null);
  ck('library card names the location', /Jerusalem/.test(lib));

  const sg = { id:'s1', canonical_id:'k1', canonicals:snake, via:'direct',
               from_name:'dan test2', from_person_id:null, source_note:'',
               matched_circles:[], matched_interest:'sent to you directly', status:'pending' };
  X.AppState.suggestions = [sg];
  const card = X.suggestionCardHtml(sg);
  ck('SUGGESTION CARD names the location - it never did', /Jerusalem/.test(card),
     card.indexOf('Jerusalem') < 0 ? 'location absent' : '');

  const modal = X.modalFileSuggestion({ sgId:'s1' });
  ck('filing panel names the location', /Jerusalem/.test(modal));

  console.log('\n-- and keeps it when there is no kind to hang it on --\n');
  const sg2 = Object.assign({}, sg, { id:'s2', canonical_id:'k2', canonicals:{
    id:'k2', name:'the national library', kind:null, location:'Jerusalem',
    primary_category:'other' } });
  X.AppState.suggestions = [sg, sg2];
  ck('suggestion card: no kind, location survives',
     /Jerusalem/.test(X.suggestionCardHtml(sg2)));
  ck('filing panel: no kind, location survives',
     /Jerusalem/.test(X.modalFileSuggestion({ sgId:'s2' })));

  console.log('\n  ' + (useOld ? 'BASELINE v0.76.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
