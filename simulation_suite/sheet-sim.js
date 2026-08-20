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
ck('APP_VERSION is v0.65.0', X.APP_VERSION==='v0.65.0 · live', X.APP_VERSION);

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
X.AppState.userMembers=[{id:'m1',name:'Rina',circleId:'c1'}];
X.AppState.userQueries[0].responses[0].contactId='m1';
X.AppState._sheet={queryId:'q1',loading:false,data:{items:[
  {name:'Avoriaz 1800',location:'',category:'travel',emoji:'x',
   notes:[{by:'Rina',note:'yes great facilities for children'}],rating:5,member_id:null}
]}};
await X.handleSaveFromSheet(0);
ck('library item created', X.AppState.userRecs.length===1 && X.AppState.userCanonicals.length===1);
const q=X.AppState.userQueries[0];
ck('response marked saved by its COMMENT/author (not by name match)', q.responses[0].savedToLibrary===true);
ck('non-matching response untouched', q.responses[1].savedToLibrary===false);
ck('saved state persisted (saveQueries called)', ctx.__savedQueries===1);

// ---- C. VERIFICATION sheet (the Avoriaz case) ----
X.AppState.userRecs=[];X.AppState.userCanonicals=[];
X.AppState._sheet={queryId:'q1',loading:false,data:{
  engine:'sheet-v4', archetype:'verification', subject:'Avoriaz 1800', subject_resolved:true,
  query_text:'is Avoriaz 1800 good for families?',
  counts:{total:1,answers:2,from_circle:2,from_you:0,corroborated:0,hidden:0},
  items:[{ name:'Avoriaz 1800', location:'Avoriaz, France', category:'travel', emoji:'x',
    is_subject:true, resolved:true, from_you:false, recommenders:['Rina','Yossi'],
    consensus:{yes:2,no:0,mixed:0,total:2},
    verdicts:[{by:'Rina',verdict:'yes',note:'yes great facilities for children'},
              {by:'Yossi',verdict:'yes',note:'yes its great good runs and no cars'}],
    notes:[{by:'Rina',note:'yes great facilities for children'}],
    rating:0, rec_id:null, member_id:null }]}};
const vhtml = X.renderSheet();
ck('verdict sheet: subject is the ENTITY, not a sentence', vhtml.indexOf('Avoriaz 1800')>=0 && vhtml.indexOf('yes its great good runs')>=0);
ck('verdict sheet: consensus shown', /Yes/.test(vhtml) && vhtml.indexOf('2 yes')>=0 && vhtml.indexOf('2 answered')>=0);
ck('verdict sheet: location + working links built from the ENTITY', vhtml.indexOf('Avoriaz, France')>=0 && /google\.com\/(search|maps)/.test(vhtml));
ck('verdict sheet: attributed testimony from both answerers', vhtml.indexOf('Rina')>=0 && vhtml.indexOf('Yossi')>=0);
ck('verdict sheet: offers ONE save for the subject', vhtml.indexOf('data-action="save-from-sheet" data-sheet-idx="0"')>=0);

// saving it must create a canonical named for the SUBJECT, with ALL comments
X.AppState.userQueries=[{id:'q1',circleId:'c1',text:'is Avoriaz 1800 good for families?',responses:[
  {id:'r1',contactId:'m1',recName:'yes great facilities for children',recNote:'',savedToLibrary:false},
  {id:'r2',contactId:'m2',recName:'yes its great good runs and no cars',recNote:'',savedToLibrary:false}]}];
X.AppState.userMembers=[{id:'m1',name:'Rina',circleId:'c1'},{id:'m2',name:'Yossi',circleId:'c1'}];
await X.handleSaveFromSheet(0);
ck('saved canonical is "Avoriaz 1800"', X.AppState.userCanonicals.length===1 && X.AppState.userCanonicals[0].name==='Avoriaz 1800' && X.AppState.userCanonicals[0].location==='Avoriaz, France');
const savedRec = X.AppState.userRecs[X.AppState.userRecs.length-1];
ck('note keeps EVERY comment, attributed', savedRec.note.indexOf('Rina: yes great facilities for children')>=0 && savedRec.note.indexOf('Yossi: yes its great good runs and no cars')>=0);
ck('both source responses marked saved (rename no longer breaks matching)', X.AppState.userQueries[0].responses.every(function(r){return r.savedToLibrary===true;}));

// ---- D. advice section for discovery/advice archetypes ----
X.AppState._sheet={queryId:'q1',loading:false,data:{
  engine:'sheet-v4', archetype:'advice', query_text:'what to do in Paris with kids?',
  counts:{total:0,advice:1}, items:[],
  advice:[{by:'Rina',note:'book the Eiffel Tower online, queues are brutal'}]}};
const ah = X.renderSheet();
ck('advice section renders prose answers instead of discarding them', ah.indexOf('ADVICE FROM YOUR CIRCLE')>=0 && ah.indexOf('queues are brutal')>=0);


// ---- E. DISCOVERY sheet with real items — the path that was crashing ----
// (regression guard for `cat is not defined`: sheetItemHtml must render)
X.AppState._sheet={queryId:'q1',loading:false,data:{
  engine:'sheet-v4', archetype:'discovery', query_text:'who is a good electrician?',
  counts:{total:2,from_circle:1,from_you:1,corroborated:0,hidden:0},
  items:[
    { name:'שושן שמוליק', location:'גאולה', category:'home', emoji:'x', from_you:false,
      recommenders:['Rina'], notes:[{by:'Rina',note:'מעולה ואמין'}], rating:0, rec_id:null, member_id:'m1' },
    { name:'Opa Restaurant', location:'Tel Aviv', category:'dining', emoji:'x', from_you:true,
      recommenders:[], notes:[{by:'You',note:'best shakshouka'}], rating:5, rec_id:'r9', member_id:null }
  ]}};
let dh='', threw=null;
try { dh = X.renderSheet(); } catch(e) { threw = e; }
ck('discovery sheet renders WITHOUT throwing (cat-bug regression)', threw===null, threw && threw.message);
ck('discovery sheet: both items drawn with names', dh.indexOf('שושן שמוליק')>=0 && dh.indexOf('Opa Restaurant')>=0);
ck('discovery sheet: category sections + save buttons present', dh.indexOf('save-from-sheet')>=0 && /HOME|DINING/i.test(dh));

console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
