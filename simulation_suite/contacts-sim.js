// contacts-sim.js — phone normalization + picker flow + batch member add (11 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={normalizeIlPhone,handlePickContacts,handleAddPickedMembers,modalAddMember,AppState};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,checked:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){},toggle(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>byId[i]||null,querySelectorAll:(sel)=>ctx.__qsa&&ctx.__qsa[sel]?ctx.__qsa[sel]:[],querySelector:(sel)=>ctx.__qs&&ctx.__qs[sel]?ctx.__qs[sel]:null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},
 navigator:{userAgent:'sim',language:'en',contacts:{select:async()=>ctx.__pick}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),
 crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:()=>({}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};'
 +'closeModal=function(){globalThis.__closed=true;};uid=function(){return "m"+(++globalThis.__uidc);};'
 +'saveCircles=async function(){globalThis.__savedC++;};saveMembers=async function(){globalThis.__savedM++;};',ctx);
ctx.__toasts=[];ctx.__uidc=0;ctx.__savedC=0;ctx.__savedM=0;ctx.__qsa={};ctx.__qs={};
const X=ctx.__x;
// normalization table
const N=X.normalizeIlPhone;
ck('050-1234567 → +972501234567', N('050-1234567')==='+972501234567');
ck('+972 50 123 4567 kept', N('+972 50 123 4567')==='+972501234567');
ck('9725x → +9725x', N('972501234567')==='+972501234567');
ck('0097250… → +97250…', N('00972501234567')==='+972501234567');
ck('garbage → empty', N('abc')==='' && N('123')==='');
// modal shows picker when supported, hides when not
X.AppState.viewParams={circleId:'c1'};
X.AppState.userCircles=[{id:'c1',name:'ספרים',color:'#217A4B',memberIds:[]}];
X.AppState.userMembers=[];
X.AppState.circleById=(id)=>X.AppState.userCircles.find(c=>c.id===id)||null;
const withPicker=X.modalAddMember({circleId:'c1'});
ck('modal offers Pick from contacts (supported)', withPicker.includes('pick-contacts'));
const savedContacts=ctx.navigator.contacts; delete ctx.navigator.contacts;
ck('modal hides picker (unsupported browser)', !X.modalAddMember({circleId:'c1'}).includes('pick-contacts'));
ctx.navigator.contacts=savedContacts;
// pick flow: 3 picked, one without tel → review with 2 rows + skip note
byId['pc-review']=el();
ctx.__pick=[{name:['רינה כהן'],tel:['050-1234567']},{name:['Yossi'],tel:['+972521112233']},{name:['NoPhone'],tel:[]}];
await X.handlePickContacts();
const rv=byId['pc-review'].innerHTML;
ck('review: 2 valid rows + normalized tels + skip note', (rv.match(/pc-cb/g)||[]).length===2 && rv.includes('+972501234567') && rv.includes('1 skipped'));
ck('review: batch-add button with count', rv.includes('Add 2 as WhatsApp members'));
// batch add: one checked, one unchecked
ctx.__qs['.modal-body[data-circle-id]']=el({dataset:{circleId:'c1'}});
ctx.__qsa['.pc-cb']=[el({checked:true,dataset:{name:'רינה כהן',tel:'+972501234567'}}),el({checked:false,dataset:{name:'Yossi',tel:'+972521112233'}})];
ctx.__closed=false;
await X.handleAddPickedMembers(el());
ck('adds exactly the checked member as whatsapp', X.AppState.userMembers.length===1 && X.AppState.userMembers[0].contactMethod==='whatsapp' && X.AppState.userMembers[0].contactValue==='+972501234567' && X.AppState.userCircles[0].memberIds.length===1);
ck('persists once + closes + toasts', ctx.__savedC===1 && ctx.__savedM===1 && ctx.__closed===true && ctx.__toasts.some(t=>String(t[0]).includes('Added 1 member')));
console.log('\nRESULT:', pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
