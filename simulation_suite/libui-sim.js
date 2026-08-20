// libui-sim.js — phone-first library header + overflow guards (10 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={renderLibrary,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},classList:{add(){},remove(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";',ctx);
const X=ctx.__x;
ck('APP_VERSION is v0.65.0', X.APP_VERSION==='v0.65.0 · live', X.APP_VERSION);
X.AppState.isDemoMode=false;
X.AppState.userCircles=[{id:'c1',name:'Ski',color:'#111',memberIds:[]},{id:'c2',name:'Food',color:'#222',memberIds:[]}];
X.AppState.userCanonicals=[{id:'k1',name:'Avoriaz 1800',primaryCategory:'travel',aiTags:[]},{id:'k2',name:'Habasta',primaryCategory:'dining',aiTags:[]}];
X.AppState.userRecs=[
 {id:'r1',canonicalId:'k1',circleId:'c1',note:'',tags:[],status:'saved'},
 {id:'r2',canonicalId:'k2',circleId:'',note:'',tags:[],status:'saved'}];  // r2 unfiled
X.AppState.userCollections=[]; X.AppState.activeFilter='all'; X.AppState.activeCatFilter='all';
X.AppState.searchQuery=''; X.AppState.libTrayOpen=false; X.AppState.libMoreOpen=false;

const h=X.renderLibrary();
ck('search bar is present', h.indexOf('search-wrap')>=0);
ck('circle filters are present', h.indexOf('data-action="set-filter"')>=0 && h.indexOf('Ski')>=0 && h.indexOf('Food')>=0);
ck('Needs filing toggle shown with a count', h.indexOf('toggle-lib-tray')>=0 && h.indexOf('Needs filing')>=0 && h.indexOf('(1)')>=0);
ck('triage tray HIDDEN until asked for', h.indexOf('triage-assign')<0);
ck('category tabs folded away by default', h.indexOf('set-cat-filter')<0);
ck('collections strip folded away by default', h.indexOf('collection-create')<0);
X.AppState.libTrayOpen=true;
ck('tray opens on toggle', X.renderLibrary().indexOf('triage-assign')>=0);
X.AppState.libTrayOpen=false; X.AppState.libMoreOpen=true;
const h2=X.renderLibrary();
ck('More reveals category tabs + collections', h2.indexOf('set-cat-filter')>=0 && h2.indexOf('collection-create')>=0);
const css=fs.readFileSync('/home/claude/app/index.html','utf8');
ck('overflow guards in CSS (no horizontal swipe)',
   css.indexOf('html, body { max-width: 100%; overflow-x: hidden; }')>=0 && css.indexOf('.lib-wrap')>=0);
// ---- narrow-screen squeeze guards (v0.30.1) ----
X.AppState.libMoreOpen = true;
X.AppState.userCollections=[{id:'col1',token:'tok1',title:'המומלצים של השכונה',description:'',recIds:['r1']}];
const strip = X.renderLibrary();
ck('collections header sits on its OWN line (no split word)',
   strip.indexOf('flex:1 0 100%;">MY COLLECTIONS')>=0);
ck('header buttons never break mid-word', (strip.match(/white-space:nowrap/g)||[]).length>=3);
ck('collection row wraps instead of squeezing', strip.indexOf('border-top:1px solid #EEF4F0;flex-wrap:wrap;')>=0);
ck('Hebrew title has room + wraps by word, not per character',
   strip.indexOf('flex:1 1 60%;min-width:150px;')>=0 && strip.indexOf('overflow-wrap:anywhere;')>=0 && strip.indexOf('המומלצים של השכונה')>=0);
ck('row action buttons form their own wrapping group',
   strip.indexOf('display:flex;gap:6px;flex-wrap:wrap;flex:1 1 100%;')>=0);
X.AppState.libMoreOpen = false;

// circle-detail members header (same defect class, 5 buttons)
X.AppState.viewParams={circleId:'c1'};
X.AppState.userMembers=[{id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#111',contactMethod:'app',contactValue:''}];
const cd = typeof renderCircleDetail==='function' ? renderCircleDetail() : '';
const appSrc = fs.readFileSync('/home/claude/app/index.html','utf8');
ck('MEMBERS header row wraps its 5 buttons',
   appSrc.indexOf('justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;')>=0);
ck('no unwrapped multi-button flex rows remain in the app',
   (function(){
     const lines = appSrc.split('\n');
     for (let i=0;i<lines.length;i++){
       if (lines[i].indexOf('display:flex')>=0 && lines[i].indexOf('flex-wrap')<0){
         const chunk = lines.slice(i,i+12).join('\n');
         if ((chunk.match(/<button/g)||[]).length>=3 && chunk.indexOf('esc(')>=0 && chunk.indexOf('<svg')<0) return false;
       }
     }
     return true;
   })());
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
