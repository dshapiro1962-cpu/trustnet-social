// screens-sim.js — renders EVERY screen with realistic fixtures.
// Checks per screen: renders without throwing, no duplicate DOM ids,
// no undefined/NaN/[object Object] leakage.
const vm = require('vm'); const fs = require('fs');
let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
src += ';globalThis.__x = { AppState, APP_VERSION };'
+ ';globalThis.__views = { home:renderHome, circles:renderCircles, "circle-detail":renderCircleDetail, query:renderQuery, history:renderHistory, "history-detail":renderHistoryDetail, answered:renderAnswered, sheet:renderSheet, inbox:renderInbox, library:renderLibrary, "rec-detail":renderRecDetail, "taste-match":renderTasteMatch, profile:renderProfile, settings:renderSettings, "query-sent":function(){ return renderQuerySent(AppState.queryState); } };';
const el = (o) => Object.assign({ value:'', style:{}, dataset:{}, innerHTML:'', textContent:'', addEventListener(){}, querySelectorAll(){return[];}, querySelector(){return null;}, closest(){return null;}, classList:{add(){},remove(){},toggle(){}} }, o||{});
function makeChain(){ const fn=function(){}; const p=new Proxy(fn,{get(_t,k){ if(k==='then') return function(){ /* pending in sim */ }; return ()=>p; }, apply(){return p;}}); return p; }
const ctx = { console: { log(){}, error(){}, warn(){} }, setTimeout:()=>0, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  document:{ getElementById:()=>null, querySelectorAll:()=>[], querySelector:()=>null, createElement:()=>el(), addEventListener(){}, removeEventListener(){}, body:el(), documentElement:el(), head:el(), hidden:false, visibilityState:'visible' },
  window:{ supabase:null, addEventListener(){}, location:{href:'https://x',search:'',hash:'',origin:'https://x'}, matchMedia:()=>({matches:false,addEventListener(){}}) },
  location:{href:'https://x',search:'',hash:'',origin:'https://x'}, navigator:{userAgent:'sim',language:'en'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u'+Math.random(),subtle:{digest:async()=>new ArrayBuffer(32)}},
  URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt:()=>null, history:{replaceState(){},pushState(){}} };
ctx.supabase = { createClient:()=>({ from:()=>makeChain(), auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}, rpc:()=>makeChain(), channel:()=>({}) }) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx; vm.createContext(ctx);
let pass=0, fail=0; const check=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,x||'');} };
vm.runInContext(src, ctx, {filename:'app.js'});
vm.runInContext('toast=function(){};', ctx);
const A = ctx.__x.AppState;
A.isDemoMode = false;
A.userProfile = { id:'me', name:'dan shapiro', avatar:'DS', avatarColor:'#217A4B', bio:'', location:'Tel Aviv', shareByDefault:true, email:'d@x.com', joinedDate:'2026-06-01' };
A.userCircles = [
  { id:'c1', name:'Dining', domain:'dining', color:'#217A4B', memberIds:['m1','m2'], description:'', location:'', isOwn:true, createdAt:'2026-06-01' },
  { id:'c2', name:'Travel', domain:'travel', color:'#2B5FA3', memberIds:['m2'], description:'', location:'', isOwn:true, createdAt:'2026-06-02' },
];
A.userMembers = [
  { id:'m1', circleId:'c1', name:'dan test', avatar:'DT', avatarColor:'#8B2FC9', contactMethod:'whatsapp', contactValue:'972505543402', responseRate:'unknown', isExternalSource:false, trustBasis:'' },
  { id:'m2', circleId:'c1', name:'naama', avatar:'NR', avatarColor:'#1E6B42', contactMethod:'email', contactValue:'n@x.com', linkedUserId:'u-naama', responseRate:'high', isExternalSource:false, trustBasis:'college' },
];
A.userCanonicals = [
  { id:'k1', name:'Hummus HaCarmel', category:'Restaurant', location:'Tel Aviv', primaryCategory:'dining', imageEmoji:'🍽️', imageUrl:'https://img.example/h.jpg', aiTags:['hummus'], websiteUrl:'https://hummus.example' },
  { id:'k2', name:'Dr. Levi', category:'', location:'', primaryCategory:'healthcare', imageEmoji:'👩‍⚕️', imageUrl:'', aiTags:[] },
];
A.userRecs = [
  { id:'r1', canonicalId:'k1', circleId:'c1', recommendedBy:'m1', note:'best in town', rating:5, tags:['hummus'], status:'saved', degree:1, isAnonymous:false, sharedToNetwork:true, date:'2026-07-01', queryId:null },
  { id:'r2', canonicalId:'k2', circleId:'', recommendedBy:'me', note:'', rating:0, tags:[], status:'saved', degree:1, isAnonymous:false, sharedToNetwork:true, date:'2026-07-02', queryId:null },
];
const resp = { id:'qr1', contactId:'m1', recName:'Shawarma Emil', recNote:'go early', recLoc:'Jaffa', recEmoji:'🥙', recTags:['shawarma'], savedToLibrary:false, respondedAt:'2026-07-14T11:00:00Z', isAnonymous:false };
A.userQueries = [
  { id:'q1', circleId:'c1', text:'best shawarma?', degree:1, status:'sent', sentAt:'2026-07-14T10:00:00Z', resolvedAt:null, chosenResponseId:null, responses:[resp] },
];
A.synCircles = []; A.synUsers = []; A._feed = []; A._notifications = [];
A.searchQuery=''; A.activeFilter='all'; A.activeCatFilter='all';
A.viewParams = { circleId:'c1', recId:'r1', queryId:'q1' };
A.queryState = { phase:'sent', text:'best shawarma?', circleId:'c1', queryId:'q1', responses:[resp], visibleCount:1,
  deliveries:[{member_id:'m1',member:'dan test',channel:'whatsapp',status:'sent',error:null},
              {member_id:'m2',member:'naama',channel:'email',status:'failed',error:'smtp_550'}] };
const views = vm.runInContext('__views', ctx);
for (const v of Object.keys(views)) {
  let html;
  try { html = views[v](); } catch (e) { check('screen "' + v + '" renders', false, e.message); continue; }
  if (typeof html !== 'string') { check('screen "' + v + '" renders', false, 'non-string'); continue; }
  check('screen "' + v + '" renders', true);
  const ids = (html.match(/ id="([^"]+)"/g) || []).map(x => x.slice(5, -1));
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  check('  "' + v + '": no duplicate ids', dup.length === 0, dup.join(','));
  const leaks = ['>undefined<', '>NaN<', '[object Object]', 'undefined<'].filter(t => html.includes(t));
  check('  "' + v + '": no undefined/NaN leakage', leaks.length === 0, leaks.join(','));
}
// targeted: home must have exactly ONE ask affordance (the ask box), not two buttons
const home = views['home']();
const askButtons = (home.match(/data-view="query"/g) || []).length + (home.match(/data-action="home-ask-go"/g) || []).length;
check('home: single ask affordance', askButtons === 1, askButtons + ' ask buttons');
console.log('\nRESULT:', pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
