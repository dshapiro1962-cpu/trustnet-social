// search-sim.js — app-side wiring of hybrid search (8 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={libFilterRecs,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async()=>{}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";',ctx);
const X=ctx.__x;
ck('APP_VERSION is v0.59.0', X.APP_VERSION==='v0.59.0 · live', X.APP_VERSION);

X.AppState.isDemoMode=false;
X.AppState.userCircles=[{id:'c1',name:'Ski',color:'#111',memberIds:[]}];
X.AppState.userCanonicals=[
 {id:'k1',name:'Avoriaz 1800',location:'Avoriaz, France',primaryCategory:'travel',aiTags:['ski','family']},
 {id:'k2',name:'Chamonix',location:'France',primaryCategory:'travel',aiTags:['ski','advanced']},
 {id:'k3',name:'Opa Restaurant',location:'Tel Aviv',primaryCategory:'dining',aiTags:['shakshouka']}];
X.AppState.userRecs=[
 {id:'r1',canonicalId:'k1',circleId:'c1',note:'great for children',tags:[],status:'saved'},
 {id:'r2',canonicalId:'k2',circleId:'c1',note:'steep runs',tags:[],status:'saved'},
 {id:'r3',canonicalId:'k3',circleId:'',note:'best shakshouka',tags:[],status:'saved'}];
X.AppState.activeFilter='all'; X.AppState.activeCatFilter='all';

// keyword-only path still works (no semantic state)
X.AppState.searchQuery='avoriaz'; X.AppState._semantic=null;
let f=X.libFilterRecs();
ck('keyword search still matches by name', f.filtered.length===1 && f.filtered[0].id==='r1');

// semantic results the keyword filter would MISS ("ski resort for children")
X.AppState.searchQuery='good ski resort for children';
X.AppState._semantic={q:'good ski resort for children', ids:['r1'], why:{r1:'family-friendly ski resort'}, reranked:true};
f=X.libFilterRecs();
ck('semantic hit surfaces an item keyword search would miss', f.filtered.length===1 && f.filtered[0].id==='r1');
ck('semantic-only items are flagged for the UI', f.semOnly['r1']===true);

// RANK ORDER must be respected (relevance beats insertion order)
X.AppState.searchQuery='ski';
X.AppState._semantic={q:'ski', ids:['r2','r1'], why:{}, reranked:true};
f=X.libFilterRecs();
ck('reranked ORDER drives result order', f.filtered.map(r=>r.id).join(',')==='r2,r1', f.filtered.map(r=>r.id).join(','));

// v0.37.0 PRODUCT LAW: the reranker's verdict is FINAL. Items it rejected do
// NOT linger after the ranked ones — that union is how a dermatologist stayed
// on the "ski" screen. (This check previously asserted the opposite.)
X.AppState._semantic={q:'ski', ids:['r1'], why:{}, reranked:true};
f=X.libFilterRecs();
ck('verdict is final: unranked items are excluded, not appended',
   f.filtered.length===1 && f.filtered[0].id==='r1', f.filtered.map(r=>r.id).join(','));

// v0.37.0: while the semantic result is in flight, only NAME/LOCATION prefix
// matches show (tags are not searchable text). 'shakshouka' is a tag, so the
// in-flight set is EMPTY and the reranker will surface it a beat later.
X.AppState.activeCatFilter='dining'; X.AppState.searchQuery='shakshouka'; X.AppState._semantic=null;
f=X.libFilterRecs();
ck('tags are not locally searchable (in-flight set empty for a tag term)',
   f.filtered.length===0, f.filtered.length+' shown');
// the category chip itself still composes with a NAME search
X.AppState.searchQuery='opa';
f=X.libFilterRecs();
ck('category filter composes with a name search',
   f.filtered.length===1 && f.filtered[0].id==='r3');

// stale semantic state (query moved on) must be ignored
X.AppState.activeCatFilter='all'; X.AppState.searchQuery='chamonix';
X.AppState._semantic={q:'something else', ids:['r1'], why:{}, reranked:true};
f=X.libFilterRecs();
ck('stale semantic state ignored', f.filtered.length===1 && f.filtered[0].id==='r2');
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
