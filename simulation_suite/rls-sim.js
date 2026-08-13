// rls-sim.js — canonicals upsert must exclude rows owned by others (5 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={saveCanonicals,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},classList:{add(){},remove(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
let captured=null, failNext=false;
ctx.supabase={createClient:()=>({from:()=>({upsert:async(rows)=>{captured=rows;return failNext?{error:{message:'permission denied',code:'42501'}}:{error:null};},select:()=>({eq:()=>({})})}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(m,t){globalThis.__toasts.push([m,t]);};CURRENT_UID="me";',ctx);
ctx.__toasts=[];
const X=ctx.__x;
ck('APP_VERSION is v0.61.1', X.APP_VERSION==='v0.61.1 · live', X.APP_VERSION);
X.AppState.userCanonicals=[
  {id:'a',name:'Mine',createdBy:'me'},
  {id:'b',name:'From a server function',createdBy:'service-uid'},
  {id:'c',name:'Brand new this session'},              // no createdBy yet
  {id:'d',name:'From the webhook',createdBy:null}];
await X.saveCanonicals();
const ids=(captured||[]).map(r=>r.id).join(',');
ck('own + new rows are sent', ids.indexOf('a')>=0 && ids.indexOf('c')>=0 && ids.indexOf('d')>=0);
ck('rows owned by OTHERS are excluded (the 403 poison)', ids.indexOf('b')<0, ids);
ck('created_by stamped as the current user', (captured||[]).every(r=>r.created_by==='me'));
// a refused write must be loud, not silent
failNext=true; ctx.__toasts=[];
let threw=false;
try { await X.saveCanonicals(); } catch(e) { threw=true; }
ck('a refused write THROWS and toasts (no more silent success)', threw && ctx.__toasts.some(t=>String(t[0]).indexOf('Could not save')>=0));
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
