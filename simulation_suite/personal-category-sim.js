// personal-category-sim.js — your category is yours; the shared one is theirs.
//
// dan, 25 Aug: "we cant be constrained by 8 categories we must give users the
// ability to add their own."
//
// The eight (dining, travel, healthcare, home, culture, hobbies, professional,
// other) are a TYPE vocabulary that has to be shared or nobody's
// recommendations reach anyone. What a person wants is a USE-CASE — "shabbat
// dinner", "quick lunch", "worth the drive" — which no fixed list can hold.
// One field was being asked both questions, which is why "other" existed at
// all, and why it disqualified primary_category as an identity discriminator
// on 24 Aug.
//
// So: recommendations.category (yours, free, per-member) for everything the
// OWNER sees; canonicals.primary_category (shared, eight) for everything that
// crosses accounts. The last section here guards that boundary, because two
// category fields on adjacent tables is exactly the ambiguity that made
// matched_circles mean two things.
//
//   node personal-category-sim.js         → web/index.html, must PASS
//   node personal-category-sim.js --old   → index.pre-v0.75.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.75.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState, saveRecs, libFilterRecs,'
     + ' recCategory: (typeof recCategory === "function") ? recCategory : null,'
     + ' ownCategories: (typeof ownCategories === "function") ? ownCategories : null,'
     + ' catHue: (typeof catHue === "function") ? catHue : null,'
     + ' learned: (typeof learnedCategoryMap === "function") ? learnedCategoryMap : null,'
     + ' propose: (typeof proposeCategory === "function") ? proposeCategory : null,'
     + ' applyLearned: (typeof applyLearnedCategories === "function") ? applyLearnedCategories : null };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let captured = null;

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
  confirm: () => true, alert(){}, prompt(){},
  atob: s => Buffer.from(s,'base64').toString('binary'),
  btoa: s => Buffer.from(s,'binary').toString('base64'),
  history: { replaceState(){}, pushState(){} },
};
ctx.supabase = { createClient: () => ({
  from: () => ({
    upsert: async (rows) => { captured = rows; return { error: null }; },
    insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error:null }) }),
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
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};'
    + 'CURRENT_UID="dan";', ctx);
  const X = ctx.__x;

  console.log('\n── the code must exist ──\n');
  ck('recCategory exists', !!X.recCategory);
  ck('ownCategories exists', !!X.ownCategories);
  ck('catHue exists', !!X.catHue);
  if (!X.recCategory || !X.ownCategories || !X.catHue) {
    console.log('\n  ' + (useOld ? 'BASELINE v0.74.1 (must FAIL)' : 'PATCHED') + ': '
      + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }

  // dan's library, with the shared type on the canonical and his own words on
  // the rec. Caffe Tamati and Hakosem are both `dining` to the machine.
  X.AppState.userCanonicals = [
    { id:'k-cafe',   name:'Caffe Tamati',      primaryCategory:'dining',  kind:'coffee shop' },
    { id:'k-falafel',name:'Hakosem',           primaryCategory:'dining',  kind:'falafel restaurant' },
    { id:'k-museum', name:'The Israel Museum', primaryCategory:'culture', kind:'museum' },
    { id:'k-skis',   name:'Rossignol Forza',   primaryCategory:'other',   kind:'skis' },
    { id:'k-wine',   name:'Wine shop',         primaryCategory:'other',   kind:'shop' },
  ];
  X.AppState.userRecs = [
    { id:'r1', canonicalId:'k-cafe',    category:'coffee',         note:'' },
    { id:'r2', canonicalId:'k-falafel', category:'shabbat dinner', note:'' },
    { id:'r3', canonicalId:'k-museum',  category:'',               note:'' },
    { id:'r4', canonicalId:'k-skis',    category:'ski gear',       note:'' },
    { id:'r5', canonicalId:'k-wine',    category:'shabbat dinner', note:'' },
  ];
  X.AppState.userMembers = [];
  X.AppState.dataLoadFailed = false;

  console.log('\n── your words win, the machine fills the gap ──\n');
  const byId2 = (id) => X.AppState.userRecs.find(r => r.id === id);
  ck('a rec you categorised shows YOUR category',
     X.recCategory(byId2('r1'), null) === 'coffee', X.recCategory(byId2('r1'), null));
  ck('a rec you have NOT categorised falls back to the shared type',
     X.recCategory(byId2('r3'), null) === 'culture', X.recCategory(byId2('r3'), null));
  ck('nothing is flattened to "other" any more',
     X.recCategory(byId2('r4'), null) === 'ski gear', X.recCategory(byId2('r4'), null));

  console.log('\n── a category can be a USE-CASE, not a type ──\n');
  const shabbat = X.AppState.userRecs.filter(r => X.recCategory(r, null) === 'shabbat dinner');
  ck('"shabbat dinner" holds a restaurant AND a wine shop',
     shabbat.length === 2 && shabbat.some(r => r.canonicalId === 'k-falafel')
                          && shabbat.some(r => r.canonicalId === 'k-wine'),
     JSON.stringify(shabbat.map(r => r.canonicalId)));
  ck('...which the eight could never express',
     ['dining','travel','healthcare','home','culture','hobbies','professional','other']
       .indexOf('shabbat dinner') < 0);

  console.log('\n── the filter row is yours ──\n');
  const cats = X.ownCategories();
  ck('ownCategories lists what you actually use',
     cats.indexOf('coffee') > -1 && cats.indexOf('ski gear') > -1
       && cats.indexOf('shabbat dinner') > -1, JSON.stringify(cats));
  ck('...most-used first, so the list stays useful',
     cats[0] === 'shabbat dinner', JSON.stringify(cats));

  X.AppState.activeFilter = 'all';
  X.AppState.activeCatFilter = 'shabbat dinner';
  X.AppState.searchQuery = '';
  let f = X.libFilterRecs();
  ck('filtering on a category you invented works',
     f.filtered.length === 2, String(f.filtered.length));

  X.AppState.activeCatFilter = 'culture';
  f = X.libFilterRecs();
  ck('...and an uncategorised item still answers its shared type',
     f.filtered.length === 1 && f.filtered[0].id === 'r3',
     JSON.stringify(f.filtered.map(r => r.id)));
  X.AppState.activeCatFilter = 'all';

  console.log('\n── colours must be stable, never random ──\n');
  const a = X.catHue('shabbat dinner'), b = X.catHue('shabbat dinner');
  ck('an invented category gets the same colour twice',
     a.fg === b.fg && a.bg === b.bg, a.fg + ' vs ' + b.fg);
  ck('...and a real colour, not the grey "other" fallback',
     a.fg !== X.catHue('other').fg, a.fg);
  ck('the built-in eight keep the colours people know',
     X.catHue('dining').fg === '#B84A0B', X.catHue('dining').fg);

  console.log('\n── it is persisted ──\n');
  captured = null;
  await X.saveRecs(['r2']);
  ck('saveRecs writes your category',
     captured && captured.length === 1 && captured[0].category === 'shabbat dinner',
     captured ? JSON.stringify(captured[0].category) : 'nothing');
  captured = null;
  await X.saveRecs(['r3']);
  ck('...and writes null rather than inventing one for you',
     captured && captured[0].category === null, JSON.stringify(captured && captured[0].category));

  console.log('\n── THE BOUNDARY: yours must not leak into matching ──\n');
  // Two category fields on adjacent tables is the risk this design carries.
  // matched_circles meaning two things cost a whole morning; this is the same
  // shape of ambiguity, so the boundary is asserted rather than trusted.
  const sweep = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'suggest-sweep', 'index.ts'), 'utf8');
  ck('the sweep matches on the item, never on the owner\'s own words',
     !/recommendations[\s\S]{0,200}?\.category/.test(sweep) && /kind/.test(sweep));
  ck('the migration says which field answers which question',
     fs.existsSync(path.join(__dirname, '..', 'migrations', '0045_personal_category.sql'))
     && /IF YOU ARE READING THIS BECAUSE YOU FOUND TWO CATEGORY COLUMNS/.test(
        fs.readFileSync(path.join(__dirname, '..', 'migrations', '0045_personal_category.sql'), 'utf8')));

  console.log('\n\u2500\u2500 learned from you, never invented \u2500\u2500\n');
  ck('learnedCategoryMap exists', !!X.learned);
  ck('proposeCategory exists', !!X.propose);
  ck('applyLearnedCategories exists', !!X.applyLearned);

  if (X.learned && X.propose && X.applyLearned) {
    // ONE example must not become a rule. Only "shabbat dinner" has two so far
    // (Hakosem the falafel restaurant, and the wine shop).
    let m = X.learned();
    ck('NEG - a single filing does NOT become a rule',
       Object.keys(m).length === 0, JSON.stringify(m));
    // "shabbat dinner" holds a falafel RESTAURANT and a wine SHOP - one example
    // of each kind, so neither reaches two. A use-case category that spans
    // different kinds is exactly the sort that must not become automatic: you
    // decide what belongs in it, not a rule inferred from a single instance.
    ck('NEG - a use-case spanning two kinds makes no rule either',
       m.restaurant === undefined && m.shop === undefined, JSON.stringify(m));

    // A second cafe filed the same way tips it over.
    X.AppState.userCanonicals.push(
      { id:'k-cafe2', name:'Another cafe', primaryCategory:'dining', kind:'coffee shop' });
    X.AppState.userRecs.push({ id:'r6', canonicalId:'k-cafe2', category:'coffee', note:'' });
    m = X.learned();
    ck('two examples of the same word for the same kind DO make a rule',
       m.cafe === 'coffee', JSON.stringify(m.cafe));

    // A brand-new cafe, uncategorised, inherits the word you already use.
    X.AppState.userCanonicals.push(
      { id:'k-cafe3', name:'Third cafe', primaryCategory:'dining', kind:'coffee shop' });
    X.AppState.userRecs.push({ id:'r7', canonicalId:'k-cafe3', category:'', note:'' });
    ck('a new cafe is proposed YOUR word for cafes',
       X.propose(X.AppState.userCanonicals.find(function(c){ return c.id === 'k-cafe3'; }), null)
         === 'coffee');
    ck('NEG \u00b7 nothing is proposed for a kind you have never filed',
       X.propose({ id:'x', kind:'dermatologist' }, null) === '', 'proposed something');
    ck('NEG \u00b7 nothing is proposed while the kind is still unknown',
       X.propose({ id:'x', kind:'' }, null) === '');

    X.AppState.isDemoMode = false;
    X.AppState.dataLoadFailed = false;
    captured = null;
    const n = await X.applyLearned();
    ck('the uncategorised cafe is filled in', n >= 1, String(n));
    ck('...and persisted in one write that names the rows',
       captured && captured.some(function(r){ return r.id === 'r7' && r.category === 'coffee'; }),
       captured ? JSON.stringify(captured.map(function(r){ return r.id + ':' + r.category; })) : 'nothing');
    ck('NEG \u00b7 a category you set yourself is never overruled',
       X.AppState.userRecs.find(function(r){ return r.id === 'r2'; }).category === 'shabbat dinner');

    captured = null;
    const n2 = await X.applyLearned();
    ck('a second pass writes nothing', n2 === 0 && captured === null, String(n2));
  }

  console.log('\n  ' + (useOld ? 'BASELINE v0.74.1 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
