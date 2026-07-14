// onb-sim.js — v0.16.0 onboarding simulation (10 checks)
const vm = require('vm'); const fs = require('fs');
let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
src += ';globalThis.__x = { onboardingSteps, renderOnboarding, renderHome, AppState, APP_VERSION };';
const el = (o) => Object.assign({ value:'', style:{}, dataset:{}, innerHTML:'', textContent:'', addEventListener(){}, querySelectorAll(){return[];}, querySelector(){return null;}, closest(){return null;}, classList:{add(){},remove(){},toggle(){}} }, o||{});
function makeChain(){ const fn=function(){}; const p=new Proxy(fn,{get(_t,k){ if(k==='then') return (r)=>r({data:[],error:null}); return ()=>p; }, apply(){return p;}}); return p; }
const ctx = { console, setTimeout:()=>0, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  document:{ getElementById:()=>null, querySelectorAll:()=>[], querySelector:()=>null, createElement:()=>el(), addEventListener(){}, removeEventListener(){}, body:el(), documentElement:el(), head:el(), hidden:false, visibilityState:'visible' },
  window:{ supabase:null, addEventListener(){}, location:{href:'https://x',search:'',hash:'',origin:'https://x'}, matchMedia:()=>({matches:false,addEventListener(){}}) },
  location:{href:'https://x',search:'',hash:'',origin:'https://x'}, navigator:{userAgent:'sim',language:'en'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
  URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt:()=>null, history:{replaceState(){},pushState(){}} };
ctx.supabase = { createClient:()=>({ from:()=>makeChain(), auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}, rpc:()=>makeChain(), channel:()=>({}) }) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx; vm.createContext(ctx);
let pass=0, fail=0; const check=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,x||'');} };
vm.runInContext(src, ctx, {filename:'app.js'});
vm.runInContext('renderApp=function(){};toast=function(){};', ctx);
const X = ctx.__x;
check('APP_VERSION is v0.16.1', X.APP_VERSION === 'v0.16.1 · live', X.APP_VERSION);
// brand-new user
X.AppState.isDemoMode = false;
X.AppState.userProfile = { id:'me', name:'dan shapiro' };
X.AppState.userCircles = []; X.AppState.userMembers = []; X.AppState.userQueries = [];
X.AppState.userRecs = []; X.AppState.userCanonicals = []; X.AppState.synCircles = []; X.AppState.synUsers = [];
X.AppState.allRecs = ()=>[]; X.AppState.canonicalById = ()=>null; X.AppState.memberById = ()=>null;
let html = X.renderOnboarding();
check('new user: card shows 0/3', html.includes('>0/3<') && html.includes('Set up your Trustnet'));
check('new user: step 1 has Create-a-circle button', html.includes('Create a circle'));
check('new user: invite + ask buttons gated until prerequisites', !html.includes('Get invite link') && !html.includes('>Ask now<'));
// circle created
X.AppState.userCircles = [{ id:'c1', name:'Dining', domain:'dining', color:'#217A4B', memberIds:[] }];
html = X.renderOnboarding();
check('after circle: 1/3, invite button appears with circle id', html.includes('>1/3<') && html.includes('Get invite link') && html.includes('data-circle-id="c1"') && html.includes('data-action="open-circle-link"'));
check('progress ring arc grows', html.includes('stroke-dasharray="35.6'));
// members added
X.AppState.userMembers = [{ id:'m1', circleId:'c1', name:'naama' }];
html = X.renderOnboarding();
check('after people: 2/3, Ask-now unlocked', html.includes('>2/3<') && html.includes('>Ask now<'));
check('done steps struck through', html.includes('line-through'));
// asked
X.AppState.userQueries = [{ id:'q1' }];
check('all done: card disappears', X.renderOnboarding() === '');
// demo mode never shows it
X.AppState.userQueries = []; X.AppState.isDemoMode = true;
check('demo mode: hidden', X.renderOnboarding() === '');
console.log('\nRESULT:', pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
