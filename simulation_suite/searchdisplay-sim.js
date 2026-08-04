// searchdisplay-sim.js — ONE AUTHORITY on the search screen (v0.37.0).
//
// THE FAILURE THIS GUARDS: for weeks the library screen UNIONED a local
// substring scan (over notes, tags, categories) with the server's reranked
// ids. The reranker would correctly reject a dermatologist for "ski"; the
// local arm would re-inject her because her circle-derived tag said "ski" —
// or a bar, because "whiskey" contains "ski". Dan's law: only the item, the
// question and the answers are searchable; the reranker's verdict is FINAL.
const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── static: the polluting arm is gone ───────────────────────────────────────
ck('no substring scan over notes/tags/categories remains',
   web.indexOf('const kwHit = hay.includes(search)') < 0);
ck('local matching reads NAME and LOCATION only',
   /\[can\.name, can\.location\]\.join/.test(web));
ck('reranker verdict is final once ids arrive (no union path)',
   /if \(sem\.indexOf\(rec\.id\) < 0\) return false;/.test(web));
ck('an EMPTY reranked answer hides everything (empty beats wrong)',
   /const semReady = sem !== null;/.test(web));

// ── behavioral: run libFiltered against a hostile library ───────────────────
const vm = require('vm');
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={libFilterRecs,AppState};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, focus(){},
  querySelector:()=>null, querySelectorAll:()=>[] });
const ctx = { console:{log(){},error(){},warn(){}},
  setTimeout:(f)=>{if(typeof f==='function')f();return 0;}, clearTimeout(){},
  setInterval:()=>1, clearInterval(){},
  document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,
    querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},
    body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
  window:{addEventListener(){},innerWidth:390,innerHeight:664,
    visualViewport:{height:664,offsetTop:0,addEventListener(){}},
    location:{href:'x',search:'',hash:'',origin:'x'},
    matchMedia:()=>({matches:false,addEventListener(){}})},
  location:{href:'x',search:'',hash:'',origin:'x'},
  navigator:{userAgent:'sim',language:'en'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async()=>({ok:true,json:async()=>({})}),
  crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
  URLSearchParams, TextEncoder, AbortController,
  confirm:()=>true, alert(){}, prompt(){}, history:{replaceState(){},pushState(){}} };
ctx.supabase = { createClient: () => ({ from:()=>({}),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:[]}), channel:()=>({}) }) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(app, ctx, { filename: 'app.js' });
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";fnPost=function(){return Promise.resolve({});};', ctx);
const X = ctx.__x;
X.AppState.isDemoMode = false;
X.AppState.activeCatFilter = 'all';
// the hostile library: dan's exact junk class
X.AppState.userCanonicals = [
  { id:'c1', name:'K2 Sender',      location:'',        aiTags:['ski','freeride'], primaryCategory:'hobbies', hasSearchDoc:true },
  { id:'c2', name:'Basta',          location:'Tel Aviv', aiTags:['ski','restaurant'], primaryCategory:'dining', hasSearchDoc:true },   // circle-poisoned tag
  { id:'c3', name:'HaWhiskey Bar',  location:'Tel Aviv', aiTags:['whiskey','bar'],  primaryCategory:'dining', hasSearchDoc:true },     // substring trap
  { id:'c4', name:'דר לירן חורב',   location:'יהוד',     aiTags:['skin','dermatologist'], primaryCategory:'healthcare', hasSearchDoc:true }, // "skin" trap
  { id:'c5', name:'Skiers Lodge',   location:'La Grave', aiTags:['ski','hotel'],    primaryCategory:'travel', hasSearchDoc:true },
];
X.AppState.userRecs = [
  { id:'r1', canonicalId:'c1', circleId:'ski1', note:'best freeride ski',        status:'available' },
  { id:'r2', canonicalId:'c2', circleId:'ski1', note:'from the ski trip dinner', status:'available' }, // note mentions ski!
  { id:'r3', canonicalId:'c3', circleId:'d1',   note:'',                         status:'available' },
  { id:'r4', canonicalId:'c4', circleId:'ski1', note:'',                         status:'available' },
  { id:'r5', canonicalId:'c5', circleId:'ski1', note:'',                         status:'available' },
];
X.AppState.userCircles = [{ id:'ski1', name:'ski' }, { id:'d1', name:'dining' }];

// Phase 1 — semantic result IN FLIGHT (sem null): prefix on name/location only
X.AppState.searchQuery = 'ski';
X.AppState._semantic = null;
let f = X.libFilterRecs();
let names = f.filtered.map(r => X.AppState.userCanonicals.find(c => c.id === r.canonicalId).name);
ck('in flight: "Skiers Lodge" appears (name prefix "ski")', names.indexOf('Skiers Lodge') >= 0, names.join(','));
ck('in flight: Basta hidden despite tag "ski" AND note mentioning ski', names.indexOf('Basta') < 0, names.join(','));
ck('in flight: whiskey bar hidden ("whiskey" is not a prefix match)', names.indexOf('HaWhiskey Bar') < 0);
ck('in flight: dermatologist hidden despite tag "skin"', names.indexOf('דר לירן חורב') < 0);
ck('in flight: K2 Sender absent (no name match — awaits the reranker)', names.indexOf('K2 Sender') < 0);

// Phase 2 — reranker has RULED: its ids are the result set, nothing else
X.AppState._semantic = { q:'ski', ids:['r1','r5'], why:{}, reranked:true };
f = X.libFilterRecs();
names = f.filtered.map(r => X.AppState.userCanonicals.find(c => c.id === r.canonicalId).name);
ck('verdict: exactly the reranked set shows', names.length === 2 && names.indexOf('K2 Sender') >= 0 && names.indexOf('Skiers Lodge') >= 0, names.join(','));
ck('verdict: Basta CANNOT re-enter through tags or note', names.indexOf('Basta') < 0);
ck('verdict: K2 Sender badged as meaning-match (no name hit)', !!f.semOnly['r1']);
ck('verdict: Skiers Lodge NOT badged (name matched too)', !f.semOnly['r5']);

// Phase 3 — reranker says NOTHING fits: empty beats wrong
X.AppState._semantic = { q:'ski', ids:[], why:{}, reranked:true };
f = X.libFilterRecs();
ck('empty verdict hides everything, even name matches', f.filtered.length === 0,
   f.filtered.length + ' shown');

// Phase 4 — Hebrew prefix works
X.AppState.searchQuery = 'דר';
X.AppState._semantic = null;
f = X.libFilterRecs();
names = f.filtered.map(r => X.AppState.userCanonicals.find(c => c.id === r.canonicalId).name);
ck('Hebrew name prefix matches while in flight', names.indexOf('דר לירן חורב') >= 0, names.join(','));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
