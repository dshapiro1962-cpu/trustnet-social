// field-contract-sim.js — which field answers which question.
//
// Five of the seven bugs found on 25 Aug were ONE FIELD ASKED TWO QUESTIONS.
// This asserts the contract rather than the instances, because fixing the
// instances is what made the day feel endless:
//
//   kind             what the thing IS          -> drives AFFORDANCES
//   category         what the owner calls it    -> beats kind for DISPLAY
//   primary_category one of eight, SHARED       -> MATCHING across accounts only
//
// THE TWO MEASURED FAILURES IT PINS DOWN
//
// 1. `Dalbello Cabrio mv 130 3dwrap alpine ski boots` was stored with
//    primary_category 'travel' - the eight have no bucket for equipment - so the
//    detail view offered "Find on Booking" for a pair of boots and a map link
//    for an object whose location is empty.
//
// 2. The same boots said "ski boots" in the inbox and "skiing" in the library,
//    because the suggestions query listed its canonical fields by hand and
//    omitted `category`. A shared renderer reading different data: sharing the
//    function without sharing the query moved the divergence one layer down.
//
//   node field-contract-sim.js         → web/index.html, must PASS
//   node field-contract-sim.js --old   → index.pre-v0.78.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.78.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState,'
     + ' facts: (typeof itemFactsText === "function") ? itemFactsText : null,'
     + ' links: (typeof itemFindLinks === "function") ? itemFindLinks : null,'
     + ' FIELDS: (typeof CANONICAL_FIELDS === "string") ? CANONICAL_FIELDS : null };';

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
    + 'CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  console.log('\n-- the contract is written down and shared --\n');
  ck('CANONICAL_FIELDS exists', !!X.FIELDS);
  ck('itemFindLinks exists', !!X.links);
  if (!X.FIELDS || !X.links) {
    console.log('\n  ' + (useOld ? 'BASELINE v0.77.0 (must FAIL)' : 'PATCHED') + ': '
      + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }
  ck('...and it includes category, which the suggestions query omitted',
     /\bcategory\b/.test(X.FIELDS), X.FIELDS);
  ck('every embedded canonical query uses the shared list',
     (src.match(/canonicals\((?!' \+ CANONICAL_FIELDS)/g) || []).length === 0,
     'hand-written embeds: ' + (src.match(/canonicals\((?!' \+ CANONICAL_FIELDS)/g) || []).length);

  // THE SKI BOOTS, exactly as stored.
  const boots = { id:'b1', name:'Dalbello Cabrio mv 130 3dwrap alpine ski boots',
                  kind:'ski boots', category:'skiing', location:'',
                  primaryCategory:'travel',
                  aiTags:['skiing','alpine','winter sports','Dalbello','footwear'] };
  const rec = { id:'r1', canonicalId:'b1', tags:[] };

  console.log('\n-- affordances follow WHAT IT IS, not which bucket --\n');
  const bootLinks = X.links(boots, rec, null);
  ck('NO hotel booking for a pair of boots', !/booking\.com/.test(bootLinks),
     /booking\.com/.test(bootLinks) ? 'offers Booking' : '');
  ck('NO map for a thing with no location', !/maps/.test(bootLinks),
     /maps/.test(bootLinks) ? 'offers a map' : '');
  ck('...it offers somewhere to buy them instead', /tbm=shop/.test(bootLinks));
  ck('...and a plain search, always', /google\.com\/search/.test(bootLinks));

  console.log('\n-- THE HARD RULE: a place link requires a place --\n');
  // Same item, still travel-classified, but now WITH a location: the rule is
  // about the place, not about defeating the category.
  const resort = { id:'b2', name:'Avoriaz 1800', kind:'ski resort',
                   location:'Haute-Savoie, France', primaryCategory:'travel', aiTags:[] };
  const resortLinks = X.links(resort, rec, null);
  ck('a ski RESORT does get Booking and a map',
     /booking\.com/.test(resortLinks) && /maps/.test(resortLinks));
  const noPlace = { id:'b3', name:'Some Hotel', kind:'hotel', location:'',
                    primaryCategory:'travel', aiTags:[] };
  ck('NEG - even a hotel gets no map when we do not know where it is',
     !/maps/.test(X.links(noPlace, rec, null)) && !/booking/.test(X.links(noPlace, rec, null)));

  console.log('\n-- one item, one description, everywhere --\n');
  // The two shapes the same row arrives in - camelCase from loadUserData, raw
  // snake_case when PostgREST embeds it in a suggestion.
  const camel = { name:boots.name, kind:'ski boots', category:'skiing', location:'',
                  primaryCategory:'travel' };
  const snake = { name:boots.name, kind:'ski boots', category:'skiing', location:'',
                  primary_category:'travel' };
  ck('inbox and library describe it identically',
     X.facts(camel) === X.facts(snake), X.facts(camel) + ' vs ' + X.facts(snake));
  ck("...using the OWNER'S word, not the librarian's",
     X.facts(camel) === 'skiing', JSON.stringify(X.facts(camel)));

  console.log('\n-- the contract itself --\n');
  ck('the contract is written down where the fields are defined',
     /THE FIELD CONTRACT/.test(src));
  ck('DISPLAY never reads primary_category directly',
     !/itemFactsText[\s\S]{0,400}?primary_category/.test(src));

  console.log('\n  ' + (useOld ? 'BASELINE v0.77.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
