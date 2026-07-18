// lib-sim.js — v0.15.0 library polish simulation (11 checks)
const vm = require('vm'); const fs = require('fs');
let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
src += ';globalThis.__x = { libFilterRecs, libResultsHtml, renderLibrary, recCardHtml, catChipSmall, CAT_HUES, AppState, APP_VERSION };';
const el = (o) => Object.assign({ value:'', style:{}, dataset:{}, innerHTML:'', textContent:'', addEventListener(){}, querySelectorAll(){return[];}, querySelector(){return null;}, closest(){return null;}, classList:{add(){},remove(){},toggle(){}} }, o||{});
function makeChain(ctx){ const fn=function(){}; const p=new Proxy(fn,{get(_t,k){ if(k==='then') return (r)=>r({data:[],error:null}); return ()=>p; }, apply(){return p;}}); return p; }
const ctx = { console, setTimeout:()=>0, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  document:{ getElementById:()=>null, querySelectorAll:()=>[], querySelector:()=>null, createElement:()=>el(), addEventListener(){}, removeEventListener(){}, body:el(), documentElement:el(), head:el(), hidden:false, visibilityState:'visible' },
  window:{ supabase:null, addEventListener(){}, location:{href:'https://x',search:'',hash:'',origin:'https://x'}, matchMedia:()=>({matches:false,addEventListener(){}}) },
  location:{href:'https://x',search:'',hash:'',origin:'https://x'}, navigator:{userAgent:'sim',language:'en'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
  URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt:()=>null, history:{replaceState(){},pushState(){}} };
ctx.supabase = { createClient:()=>({ from:()=>makeChain(ctx), auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}, rpc:()=>makeChain(ctx), channel:()=>({}) }) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx; vm.createContext(ctx);
let pass=0, fail=0; const check=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,x||'');} };
vm.runInContext(src, ctx, {filename:'app.js'});
vm.runInContext('renderApp=function(){};toast=function(){};', ctx);
const X = ctx.__x;
check('APP_VERSION is v0.19.1', X.APP_VERSION === 'v0.19.1 · live', X.APP_VERSION);
// fixtures
X.AppState.isDemoMode = false;
X.AppState.userCircles = [{ id:'c1', name:'Dining', domain:'dining', color:'#217A4B' }];
X.AppState.userCanonicals = [
  { id:'k1', name:'Hummus HaCarmel', location:'Tel Aviv', primaryCategory:'dining', imageEmoji:'🍽️', imageUrl:'' },
  { id:'k2', name:'Dr. Levi', primaryCategory:'healthcare', imageEmoji:'👩‍⚕️', imageUrl:'' },
];
X.AppState.userRecs = [
  { id:'r1', canonicalId:'k1', circleId:'c1', tags:[], status:'saved', note:'' },
  { id:'r2', canonicalId:'k2', circleId:'c1', tags:[], status:'saved', note:'' },
];
X.AppState.canonicalById = (id)=>X.AppState.userCanonicals.find(c=>c.id===id)||null;
X.AppState.circleById = (id)=>X.AppState.userCircles.find(c=>c.id===id)||null;
X.AppState.allRecs = ()=>X.AppState.userRecs;
X.AppState.synCircles = []; X.AppState.activeFilter='all'; X.AppState.activeCatFilter='all';
X.AppState.searchQuery=''; X.AppState.memberById=()=>null; X.AppState.userProfile={id:'me',name:'dan'};

const lib = X.renderLibrary();
check('category tabs render for present categories', lib.includes('All types') && lib.includes('>Dining<') && lib.includes('>Healthcare<'));
check('tabs carry set-cat-filter action', (lib.match(/data-action="set-cat-filter"/g)||[]).length === 3);
check('cards carry category chips with hues', lib.includes('cat-chip') && lib.includes(X.CAT_HUES.dining.fg) && lib.includes(X.CAT_HUES.healthcare.fg));
X.AppState.activeCatFilter = 'healthcare';
const f1 = X.libFilterRecs();
check('category filter narrows results', f1.filtered.length === 1 && f1.filtered[0].id === 'r2');
X.AppState.activeCatFilter = 'all';
// semantic: keyword miss + semantic hit
X.AppState.searchQuery = 'stomach doctor';
X.AppState._semantic = { q:'stomach doctor', ids:['r2'] };
X.AppState._semPending = false;
const f2 = X.libFilterRecs();
check('semantic-only hit passes the filter', f2.filtered.length === 1 && f2.filtered[0].id === 'r2');
check('semantic-only hit is flagged', f2.semOnly['r2'] === true);
const html2 = X.libResultsHtml(f2);
check('matched-by-meaning tag rendered', html2.includes('matched by meaning'));
check('no shimmer when settled', !html2.includes('sem-shimmer'));
X.AppState._semPending = true;
const html3 = X.libResultsHtml(X.libFilterRecs());
check('shimmer shows while semantic pending', html3.includes('sem-shimmer') && html3.includes('searching by meaning'));
// keyword hit must NOT get the tag
X.AppState._semPending = false;
X.AppState.searchQuery = 'hummus';
X.AppState._semantic = { q:'hummus', ids:['r1'] };
const f3 = X.libFilterRecs();
check('keyword hit not tagged as semantic', f3.filtered.length === 1 && !f3.semOnly['r1']);
console.log('\nRESULT:', pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
