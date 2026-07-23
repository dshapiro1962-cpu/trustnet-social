// editdel-sim.js — v0.22.0 edit/delete/share everywhere (16 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={modalEditRec,handleSaveEditRec,handleDeleteRec,modalShareRec,recShareText,modalEditCircle,handleSaveEditCircle,handleDeleteCircle,modalEditCollection,handleSaveEditCollection,handleDeleteCollection,renderRecDetail,renderCollectionsStrip,renderCircleDetail,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,checked:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>byId[i]||null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async()=>{}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'u'+(++ctxUid),subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>ctx.__confirm,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
let ctxUid=0;
ctx.__confirm=true;
ctx.__sb=[];
const chain=(table,op)=>{const call={table,op,args:[]};ctx.__sb.push(call);const c={update:(o)=>{call.op='update';call.payload=o;return c;},delete:()=>{call.op='delete';return c;},eq:(k,v)=>{call.args.push([k,v]);return Promise.resolve({error:null});},};return c;};
ctx.supabase={createClient:()=>({from:(t)=>({update:(o)=>chain(t,'update').update(o),delete:()=>chain(t,'delete').delete(),select:()=>({eq:()=>({})}),insert:()=>({})}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c2,x)=>{ if(c2){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(v){globalThis.__view=v;};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};'
 +'closeModal=function(){globalThis.__closed=(globalThis.__closed||0)+1;};'
 +'saveCircles=async function(){globalThis.__saved.circles++;};saveMembers=async function(){globalThis.__saved.members++;};'
 +'saveRecs=async function(){globalThis.__saved.recs++;};saveCanonicals=async function(){globalThis.__saved.cans++;};'
 +'CURRENT_UID="me";',ctx);
ctx.__toasts=[];ctx.__saved={circles:0,members:0,recs:0,cans:0};
const X=ctx.__x;
ck('APP_VERSION is v0.22.0', X.APP_VERSION==='v0.22.0 · live', X.APP_VERSION);

// Seed state: circle, members (wa+email+app), canonical (no location — the k2 case), rec
X.AppState.isDemoMode=false;
X.AppState.userProfile={id:'me',name:'Dan S',avatar:'DS',avatarColor:'#217A4B',shareByDefault:true};
X.AppState.userCircles=[{id:'c1',name:'Ski',domain:'hobbies',color:'#1F8A70',description:'',memberIds:['m1','m2','m3']}];
X.AppState.userMembers=[
 {id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#111',contactMethod:'whatsapp',contactValue:'+972501234567'},
 {id:'m2',circleId:'c1',name:'Yossi',avatar:'Y',avatarColor:'#222',contactMethod:'email',contactValue:'y@x.com'},
 {id:'m3',circleId:'c1',name:'NoContact',avatar:'N',avatarColor:'#333',contactMethod:'app',contactValue:''}];
X.AppState.userCanonicals=[{id:'can-k2',type:'place',name:'k2',category:'',location:'',imageEmoji:'📌',primaryCategory:'hobbies',aiTags:['ski']}];
X.AppState.userRecs=[{id:'rec1',canonicalId:'can-k2',circleId:'c1',recommendedBy:'m1',note:'מקלות מעולים',rating:5,tags:['ski'],status:'saved',queryId:null,sourceLabel:''}];
X.AppState.userCollections=[{id:'col1',token:'tok12',title:'רשימת סקי',description:'',recIds:['rec1']}];
X.AppState.userQueries=[];

// ── rec-detail: Maps link even without location + action row ──
X.AppState.currentView='rec-detail'; X.AppState.viewParams={recId:'rec1'};
const det=X.renderRecDetail();
ck('detail: Maps link present even with NO location', det.indexOf('google.com/maps/search')>=0);
ck('detail: Google search always present', det.indexOf('google.com/search?q=')>=0);
ck('detail: Send/Edit/Delete action row', det.indexOf('data-modal="share-rec"')>=0 && det.indexOf('data-modal="edit-rec"')>=0 && det.indexOf('data-action="delete-rec"')>=0);

// ── edit rec: modal + save ──
const em=X.modalEditRec({recId:'rec1'});
ck('edit-rec modal: fields prefilled incl. what-is-it', em.indexOf('value="k2"')>=0 && em.indexOf('er-cat')>=0 && em.indexOf('רשימת')<0);
byId['er-name']=el({value:'K2 Mindbender 90'}); byId['er-cat']=el({value:'מקלות סקי'});
byId['er-loc']=el({value:''}); byId['er-note']=el({value:'הכי טובים שהיו לי'});
byId['er-tags']=el({value:'ski, gear'}); byId['er-circle']=el({value:'c1'});
await X.handleSaveEditRec(el({dataset:{recId:'rec1'}}));
ck('edit-rec save: canonical + rec updated, persisted', X.AppState.userCanonicals[0].name==='K2 Mindbender 90'
  && X.AppState.userCanonicals[0].category==='מקלות סקי'
  && X.AppState.userRecs[0].note==='הכי טובים שהיו לי'
  && X.AppState.userRecs[0].tags.length===2
  && ctx.__saved.cans===1 && ctx.__saved.recs===1);

// ── share rec: modal rows per channel ──
const sm=X.modalShareRec({recId:'rec1'});
ck('share: all 3 members listed with circle name', (sm.match(/sr-row/g)||[]).length===3 && sm.indexOf('Ski')>=0);
ck('share: WhatsApp deep link with encoded text', sm.indexOf('wa.me/972501234567?text=')>=0 && sm.indexOf(encodeURIComponent('K2 Mindbender 90'))>=0);
ck('share: email member gets mailto with body', sm.indexOf('mailto:y@x.com')>=0 && sm.indexOf('body=')>=0);
ck('share: contactless member marked', sm.indexOf('no direct contact')>=0);
const txt=X.recShareText(X.AppState.userRecs[0], X.AppState.userCanonicals[0]);
ck('share text: name+category+note+google link (no location → search)', txt.indexOf('K2 Mindbender 90')>=0 && txt.indexOf('(מקלות סקי)')>=0 && txt.indexOf('google.com/search')>=0);

// ── edit circle ──
byId['ec-name']=el({value:'Ski & Snow'}); byId['ec-domain']=el({value:'hobbies'});
byId['ec-desc']=el({value:'חורף'}); byId['ec-color']=el({value:'#1A6FA8'});
await X.handleSaveEditCircle(el({dataset:{circleId:'c1'}}));
ck('edit-circle save: fields updated + persisted', X.AppState.userCircles[0].name==='Ski & Snow'
  && X.AppState.userCircles[0].color==='#1A6FA8' && ctx.__saved.circles===1);

// ── delete collection (sb captured) ──
await X.handleDeleteCollection(el({dataset:{collId:'col1'}}));
const delCalls=ctx.__sb.filter(c=>c.op==='delete').map(c=>c.table);
ck('delete-collection: items then collection deleted, state pruned', delCalls.indexOf('collection_items')>=0 && delCalls.indexOf('collections')>=0 && X.AppState.userCollections.length===0);

// ── edit collection (recreate → update) ──
X.AppState.userCollections=[{id:'col2',token:'tok34',title:'old',description:'',recIds:[]}];
byId['ecl-title']=el({value:'רשימה חדשה'}); byId['ecl-desc']=el({value:'תיאור'});
await X.handleSaveEditCollection(el({dataset:{collId:'col2'}}));
const upd=ctx.__sb.find(c=>c.op==='update'&&c.table==='collections');
ck('edit-collection: sb update + local state', upd && upd.payload.title==='רשימה חדשה' && X.AppState.userCollections[0].title==='רשימה חדשה');

// ── delete rec ──
await X.handleDeleteRec(el({dataset:{recId:'rec1'}}));
ck('delete-rec: removed + persisted + back to library', X.AppState.userRecs.length===0 && ctx.__saved.recs===2 && ctx.__view==='library');

// ── delete circle: members go, recs unfiled ──
X.AppState.userRecs=[{id:'rec9',canonicalId:'can-k2',circleId:'c1',recommendedBy:'m1',note:'',tags:[],status:'saved'}];
await X.handleDeleteCircle(el({dataset:{circleId:'c1'}}));
ck('delete-circle: circle+members removed, rec moved to tray', X.AppState.userCircles.length===0
  && X.AppState.userMembers.length===0 && X.AppState.userRecs[0].circleId==='' && ctx.__view==='circles');
console.log('\nRESULT:', pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
