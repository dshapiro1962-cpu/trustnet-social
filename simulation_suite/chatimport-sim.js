// chatimport-sim.js — WA export parser (real שיכון fixture), scan flow, review, save (14 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={parseWaExport,stripBidi,modalChatImport,handleChatImportRun,handleChatImportSave,renderCollectionsStrip,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,checked:false,files:null,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>byId[i]||null,querySelectorAll:(sel)=>ctx.__qsa&&ctx.__qsa[sel]?ctx.__qsa[sel]:[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async(t)=>{ctx.__copied=t;}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(v){globalThis.__view=v;};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};'
 +'closeModal=function(){globalThis.__closed=true;};'
 +'fnPost=async function(n,b){globalThis.__fn.push([n,b]);return globalThis.__fnImpl(n,b);};'
 +'CURRENT_UID="me";loadUserData=async function(){globalThis.__reloaded=true;};',ctx);
ctx.__toasts=[];ctx.__fn=[];ctx.__qsa={};
const X=ctx.__x;
ck('APP_VERSION is v0.21.0', X.APP_VERSION==='v0.21.0 · live', X.APP_VERSION);

// ---- PARSER vs the REAL שיכון export ----
const fixture = fs.readFileSync('/home/claude/sim/shikun_fixture.txt','utf8');
const msgs = X.parseWaExport(fixture);
ck('parses substantial message count from real export', msgs.length >= 50 && msgs.length <= 237, 'got '+msgs.length);
ck('noise filtered: no encryption/omitted/system lines', !msgs.some(m=>/end-to-end|omitted|added you|created this group/i.test(m.t)));
ck('multi-line messages merged (renovation rec > 100 chars)', msgs.some(m=>m.t.length>100 && m.t.indexOf('\n')>=0));
ck('senders + dates captured', msgs.every(m=>m.s && m.d));
ck('known content present (shushan renovation rec)', msgs.some(m=>m.t.indexOf('0505303690')>=0 || m.t.indexOf('050-5303690')>=0 || m.t.indexOf('שושן')>=0));

// ---- strip has the entry point ----
X.AppState.isDemoMode=false; X.AppState.userCollections=[]; X.AppState.userCircles=[{id:'c1',name:'השכונה',color:'#8A6D1A',memberIds:[]}];
ck('strip: Import WhatsApp chat button wired', X.renderCollectionsStrip().includes('data-modal="chat-import"'));
ck('modal renders with file input + scan action', X.modalChatImport().includes('id="ci-file"') && X.modalChatImport().includes('chat-import-run'));

// ---- scan flow: 2 batches → aggregate + dedup + review ----
byId['ci-file']=el({files:[{name:'WhatsApp Chat with שיכון.txt', text:async()=>fixture}]});
byId['ci-status']=el(); byId['ci-review']=el();
ctx.__fnImpl=async(n,b)=>({engine:'extract-chat-recs-v1',items:[
  {name:'שושן שמוליק',category:'home',location:'גאולה',note:'מעולה ואמין',phone:'050-5303690'},
  {name:'ד"ר לירן חורב',category:'healthcare',location:'יהוד',note:'מומלצת',phone:''},
  {name:'שושן שמוליק',category:'home',location:'',note:'שיפוצניק מקצועי ואחראי לגמרי',phone:''}]});
const runBtn=el();
await X.handleChatImportRun(runBtn);
ck('scan: batches posted with mode extract', ctx.__fn.filter(c=>c[0]==='extract-chat-recs'&&c[1].mode==='extract').length>=1);
const revHtml=byId['ci-review'].innerHTML;
ck('dedup: shushan merged with ×2 badge + longest note kept', revHtml.includes('\u00d72') && revHtml.includes('שיפוצניק מקצועי'));
ck('review: circle picker + collection option + save action', revHtml.includes('id="ci-circle"') && revHtml.includes('id="ci-mkcol"') && revHtml.includes('chat-import-save'));
ck('status announces found count', byId['ci-status'].textContent.indexOf('Found 2')===0);

// ---- save flow ----
ctx.__qsa['.ci-cb']=[el({checked:true,dataset:{idx:'0'}}),el({checked:false,dataset:{idx:'1'}})];
byId['ci-circle']=el({value:'c1'}); byId['ci-mkcol']=el({checked:true}); byId['ci-coltitle']=el({value:'המומלצים של השכונה'});
ctx.__fnImpl=async(n,b)=>({engine:'extract-chat-recs-v1',saved:1,skipped:0,collection_token:'tok123abc456'});
ctx.__closed=false; ctx.__copied=''; ctx.__reloaded=false;
await X.handleChatImportSave(el());
const saveCall=ctx.__fn.find(c=>c[1]&&c[1].mode==='save');
ck('save: posts selected item + circle + collection title', saveCall && saveCall[1].items.length===1 && saveCall[1].circle_id==='c1' && saveCall[1].collection_title==='המומלצים של השכונה');
ck('save: link copied + modal closed + data reloaded + library shown', ctx.__copied.includes('/collection.html?t=tok123abc456') && ctx.__closed===true && ctx.__reloaded===true && ctx.__view==='library');
console.log('\nRESULT:', pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
