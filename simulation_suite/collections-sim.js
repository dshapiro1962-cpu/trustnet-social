// collections-sim.js — collections strip, create modal + handler, copy link, import flow (12 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={renderCollectionsStrip,modalCollectionCreate,handleCreateCollection,handleCopyCollectionLink,handleImportCollection,collectionUrl,renderLibrary,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,checked:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
let sbOps=[]; let sbResults=[];
function makeChain(){
  const call={table:null,op:null,payload:null};
  const fn=function(){};
  const p=new Proxy(fn,{
    get(_t,k){
      if(k==='then'){ const res = sbResults.length ? sbResults.shift() : {data:[],error:null}; sbOps.push(call); return (r)=>r(res); }
      return (...a)=>{ if(!call.op){call.op=k; call.payload=a[0];} else if(k==='insert'||k==='select'||k==='update'){call.op=k;call.payload=a[0];} return p; };
    },
    apply(){return p;}
  });
  return p;
}
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>byId[i]||null,querySelectorAll:(sel)=>ctx.__qsa && ctx.__qsa[sel] ? ctx.__qsa[sel] : [],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'https://x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'https://x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async(t)=>{ctx.__copied=t;}}},
 localStorage:{__s:{},getItem(k){return this.__s[k]||null;},setItem(k,v){this.__s[k]=v;},removeItem(k){delete this.__s[k];}},
 sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'aabbccddeeff-0011-2233-4455-667788990011',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){ctx.__prompted=true;},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:(t)=>{const c=makeChain(); return c;},auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>makeChain(),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};'
 +'closeModal=function(){globalThis.__closed=true;};'
 +'fnPost=async function(n,b){globalThis.__fn.push([n,b]);return globalThis.__fnImpl(n,b);};'
 +'CURRENT_UID="me";loadUserData=async function(){globalThis.__reloaded=true;};',ctx);
ctx.__toasts=[];ctx.__fn=[];ctx.__fnImpl=async()=>({});
const X=ctx.__x;
ck('APP_VERSION is v0.18.0', X.APP_VERSION==='v0.18.0 · live', X.APP_VERSION);
X.AppState.isDemoMode=false;
X.AppState.userProfile={id:'me',name:'dan'};
X.AppState.userCollections=[{id:'cl1',token:'tok123',title:'My Tel Aviv doctors',description:'',recIds:['r1','r2']}];
X.AppState.userRecs=[{id:'r1',canonicalId:'k1'},{id:'r2',canonicalId:'k2'}];
X.AppState.userCanonicals=[{id:'k1',name:'Dr. Levi',location:'Tel Aviv',imageEmoji:'🩺'},{id:'k2',name:'Dr. Cohen',location:'',imageEmoji:'🦷'}];
X.AppState.canonicalById=(id)=>X.AppState.userCanonicals.find(c=>c.id===id)||null;
X.AppState.userCircles=[];X.AppState.synCircles=[];X.AppState.allRecs=()=>X.AppState.userRecs;X.AppState.circleById=()=>null;X.AppState.memberById=()=>null;
X.AppState.activeFilter='all';X.AppState.activeCatFilter='all';X.AppState.searchQuery='';
// strip
const strip=X.renderCollectionsStrip();
ck('strip: shows collection with count + actions', strip.includes('My Tel Aviv doctors') && strip.includes('2 items') && strip.includes('copy-collection-link') && strip.includes('+ New collection'));
ck('strip: share URL points at collection.html', strip.includes('/collection.html?t=tok123'));
ck('library embeds collections strip', X.renderLibrary().includes('collections-strip'));
// modal
const modal=X.modalCollectionCreate();
ck('modal: items listed as checkboxes', (modal.match(/coll-item-cb/g)||[]).length>=2 && modal.includes('Dr. Levi'));
// create: validation
byId['coll-title']=el({value:''}); byId['coll-desc']=el({value:''}); byId['coll-err']=el();
ctx.__qsa={'.coll-item-cb':[]};
const btn=el(); await X.handleCreateCollection(btn);
ck('create: name required', byId['coll-err'].style.display==='block' && sbOps.length===0);
// create: success path
byId['coll-title'].value='My list'; 
ctx.__qsa={'.coll-item-cb':[el({checked:true,value:'r1'}),el({checked:false,value:'r2'})]};
sbResults=[{data:{id:'newcol'},error:null},{data:null,error:null}];
sbOps=[]; ctx.__closed=false; ctx.__copied='';
await X.handleCreateCollection(el());
ck('create: inserts collection then items', sbOps.length===2);
ck('create: 12-char token in state + link copied', X.AppState.userCollections.length===2 && X.AppState.userCollections[1].token.length===12 && ctx.__copied.includes('/collection.html?t='));
ck('create: modal closed + toast', ctx.__closed===true && ctx.__toasts.some(t=>String(t[0]).includes('link copied')));
// copy link
ctx.__copied='';
await X.handleCopyCollectionLink(el({dataset:{token:'tok123'}}));
ck('copy link: clipboard gets full URL', ctx.__copied==='https://trustnetsocial.netlify.app/collection.html?t=tok123');
// import flow
ctx.__fnImpl=async()=>({engine:'save-collection-v1',ok:true,imported:3,skipped:1,curator:'Rina'});
ctx.localStorage.setItem('tn_collection_token','tokZZZ');
ctx.__reloaded=false;
await X.handleImportCollection('tokZZZ');
ck('import: calls save-collection, clears token, reloads data', ctx.__fn.some(c=>c[0]==='save-collection'&&c[1].token==='tokZZZ') && ctx.localStorage.getItem('tn_collection_token')===null && ctx.__reloaded===true);
ck('import: curator-named toast', ctx.__toasts.some(t=>String(t[0]).includes('Saved 3 items from Rina')));
console.log('\nRESULT:', pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
