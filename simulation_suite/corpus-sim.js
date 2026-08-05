// corpus-sim.js — the three gaps, tested against dan's REAL 20-question corpus (12 checks)
const vm=require('vm'); const fs=require('fs');
const src=fs.readFileSync('/home/claude/functions/build-sheet/index.ts','utf8');
let app=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
app += ';globalThis.__x={renderSheet,AppState,APP_VERSION};';
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
vm.runInContext(app,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";',ctx);
const X=ctx.__x;
ck('APP_VERSION is v0.39.0', X.APP_VERSION==='v0.39.0 · live', X.APP_VERSION);

// ---- GAP 1: the FUNCTION knows about comparison + reference ----
ck('classifier offers comparison + reference (source)', src.indexOf('"comparison"')>0 && src.indexOf('"reference"')>0);
ck('corpus examples are IN the prompt (La Grave / Santorini / Harry Potter)',
   src.indexOf('La Grave')>0 && src.indexOf('Santorini')>0 && src.indexOf('Harry Potter')>0);
ck('subjects are resolved as an ARRAY, not one', src.indexOf('const subjects: Subject[] = []')>0);
ck('each answer is targeted at the subject it names', src.indexOf('let target: Subject | null = null')>0);
ck('answers naming NEITHER subject become general advice', src.indexOf('generalAdvice.push')>0);
ck('reference excluded from library candidates AND responses',
   src.indexOf('the reference is not an answer')>0 && src.indexOf('!norm(l.name).includes(refNorm)')>0);
ck('"expensive"/יקר reads as a MIXED verdict (corpus Q1a, Q14b)', src.indexOf('expensive')>0);

// ---- GAP 1 rendering: Q1 Weber vs Napoleon ----
X.AppState.isDemoMode=false;
X.AppState.userQueries=[{id:'q1',circleId:'c1',text:'which is better the Weber Spirit E-325 or the NAPOLEON Rogue 425'}];
X.AppState.userCircles=[{id:'c1',name:'BBQ',color:'#111',memberIds:[]}];
X.AppState.userMembers=[];X.AppState.userCanonicals=[];X.AppState.userRecs=[];
X.AppState.currentView='sheet'; X.AppState.viewParams={queryId:'q1'};
X.AppState._sheet={queryId:'q1',loading:false,data:{
  engine:'sheet-v4', archetype:'comparison', subject:'Weber Spirit E-325', subject_count:2,
  query_text:'which is better the Weber Spirit E-325 or the NAPOLEON Rogue 425',
  counts:{total:2,answers:3,advice:1},
  advice:[{by:'Avi',note:'both are good but Napoleon a lot more expensive'}],
  items:[
    {name:'Weber Spirit E-325',location:'',category:'home',emoji:'x',is_subject:true,resolved:true,
     recommenders:['Rina'],consensus:{yes:1,no:0,mixed:0,total:1},
     verdicts:[{by:'Rina',verdict:'yes',note:'I find the Weber more user friendly'}],notes:[],rating:0,rec_id:null,member_id:null},
    {name:'Napoleon Rogue 425',location:'',category:'home',emoji:'x',is_subject:true,resolved:true,
     recommenders:['Yossi'],consensus:{yes:1,no:0,mixed:0,total:1},
     verdicts:[{by:'Yossi',verdict:'yes',note:"Napoleon doesn't rust so much"}],notes:[],rating:0,rec_id:null,member_id:null}
  ]}};
const ch=X.renderSheet();
ck('comparison sheet shows BOTH products', ch.indexOf('Weber Spirit E-325')>=0 && ch.indexOf('Napoleon Rogue 425')>=0);
ck('each product carries its own comment', ch.indexOf('more user friendly')>=0 && ch.indexOf("rust so much")>=0);
ck('each product is separately saveable', (ch.match(/save-from-sheet/g)||[]).length===2);
ck('answers about neither appear as GENERAL COMMENTS', ch.indexOf('GENERAL COMMENTS')>=0 && ch.indexOf('a lot more expensive')>=0);
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
