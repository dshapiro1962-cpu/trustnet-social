// sheet-sim.js — v0.23.0: sheet error surfacing + save-from-sheet marks responses (6 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={renderSheet,handleSaveFromSheet,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
const byId={};
['app','login-screen','modal-root','toast-container','view-root'].forEach(function(k){byId[k]=el();});
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{ if(!byId[i]) byId[i]=el(); return byId[i]; },querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async()=>{}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({update:()=>({eq:async()=>({error:null})}),select:()=>({eq:()=>({})})}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(v){};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};'
 +'saveCanonicals=async function(){};saveRecs=async function(){};'
 +'saveQueries=async function(){globalThis.__savedQueries++;};uid=function(){return "u"+(++globalThis.__u);};'
 +'CURRENT_UID="me";fnPost=async function(n,b){return globalThis.__fnImpl(n,b);};',ctx);
ctx.__toasts=[];ctx.__savedQueries=0;ctx.__u=0;
const X=ctx.__x;
ck('APP_VERSION is v0.23.0', X.APP_VERSION==='v0.23.0 · live', X.APP_VERSION);

// ---- A. sheet failure surfaces the REAL error, not "network" ----
X.AppState.isDemoMode=false;
X.AppState.userQueries=[{id:'q1',circleId:'c1',text:'is Avoriaz 1800 good for families?',responses:[
  {id:'r1',recName:'yes great facilities for children',recNote:'',savedToLibrary:false},
  {id:'r2',recName:'yes its great good runs and no cars',recNote:'',savedToLibrary:false}]}];
X.AppState.userCircles=[{id:'c1',name:'Ski',color:'#111',memberIds:[]}];
X.AppState.userMembers=[];X.AppState.userCanonicals=[];X.AppState.userRecs=[];
X.AppState.currentView='sheet'; X.AppState.viewParams={queryId:'q1'};
X.AppState._sheet=null;
ctx.__fnImpl=async()=>{ throw new TypeError('Failed to fetch'); };
X.renderSheet();
await new Promise(r=>setTimeout(r,10));
const st=X.AppState._sheet;
ck('sheet catch stores the VERBATIM error (not "network")', st && /TypeError: Failed to fetch/.test(st.error||''), JSON.stringify(st));
X.AppState._sheet=st;
ck('sheet error view shows that detail to the user', X.renderSheet().indexOf('Failed to fetch')>=0);

// ---- B. save-from-sheet marks the source responses as saved ----
X.AppState._sheet={queryId:'q1',loading:false,data:{items:[
  {name:'yes great facilities for children',location:'',category:'travel',emoji:'x',notes:[{by:'Rina',note:'great'}],rating:5,member_id:null}
]}};
await X.handleSaveFromSheet(0);
ck('library item created', X.AppState.userRecs.length===1 && X.AppState.userCanonicals.length===1);
const q=X.AppState.userQueries[0];
ck('matching response marked savedToLibrary', q.responses[0].savedToLibrary===true);
ck('non-matching response untouched', q.responses[1].savedToLibrary===false);
ck('saved state persisted (saveQueries called)', ctx.__savedQueries===1);
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
