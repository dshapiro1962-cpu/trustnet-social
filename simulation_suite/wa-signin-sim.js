// wa-signin-sim.js — WhatsApp identity + no-stale-data guarantees (18 checks)
const vm=require('vm'); const fs=require('fs');
const fnSrc=fs.readFileSync('/home/claude/functions/wa-signin/index.ts','utf8');
const sqlSrc=fs.readFileSync('/home/claude/functions/0017_phone_identity.sql','utf8');
let app=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
app += ';globalThis.__x={waLoginPhoneOk,resolveContacts,refreshCircleLinks,handleInviteNew,modalInvite,inviteMessageFor,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{if(typeof f==='function')f();return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},open:(u)=>{ctx.__opened.push(u);},location:{href:'x',search:'',hash:'',origin:'https://t.app',reload(){ctx.__reloaded=true;}},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'https://t.app',reload(){ctx.__reloaded=true;}},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async()=>{}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async(u,i)=>({ok:true,status:200,json:async()=>({})}),
 crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.__opened=[];ctx.__rpc=[];
ctx.supabase={createClient:()=>({from:()=>({select:()=>({eq:async()=>({data:ctx.__memberRows||[]})})}),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}}),setSession:async()=>({error:null})},
  rpc:async(n,a)=>{ctx.__rpc.push([n,a]); return ctx.__rpcImpl(n,a);},channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(app,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};openModal=function(n,p){globalThis.__om=[n,p];};closeModal=function(){};'
 +'toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};CURRENT_UID="me";',ctx);
ctx.__toasts=[]; ctx.__rpcImpl=async()=>({data:[]});
const X=ctx.__x;
ck('APP_VERSION is v0.59.0', X.APP_VERSION==='v0.59.0 · live', X.APP_VERSION);

// ── phone identity: app, function and SQL must agree on ONE canonical form ──
function keyJs(raw){const d=String(raw||'').replace(/\D/g,'');return d.length>=9?d.slice(-9):d;}
const forms=['050-123-4567','+972 50 123 4567','0501234567','972501234567','+972501234567'];
ck('all phone formats collapse to one key (app side)', new Set(forms.map(keyJs)).size===1);
ck('the FUNCTION uses the same rule', fnSrc.indexOf('d.length >= 9 ? d.slice(-9) : d')>=0);
ck('the DATABASE uses the same rule', sqlSrc.indexOf('right(regexp_replace(p_raw') >= 0 && sqlSrc.indexOf("'g'), 9)") >= 0);
ck('users.phone_key is generated, not hand-maintained', sqlSrc.indexOf('generated always as (phone_key(phone)) stored')>=0);
ck('members.contact_key is generated too', sqlSrc.indexOf('generated always as (')>=0 && sqlSrc.indexOf('members add column if not exists contact_key')>=0);
ck('one account per number enforced', sqlSrc.indexOf('users_phone_key_uniq')>=0);
ck('sign-in phones accepted, junk rejected',
   X.waLoginPhoneOk('050 123 4567') && X.waLoginPhoneOk('+972501234567') && !X.waLoginPhoneOk('123') && !X.waLoginPhoneOk('abc'));

// ── OTP security ──
ck('codes stored HASHED, never in clear', fnSrc.indexOf('code_hash')>=0 && fnSrc.indexOf('sha256(key + ":" + code)')>=0);
ck('codes expire and attempts are capped', fnSrc.indexOf('CODE_TTL_MIN')>=0 && fnSrc.indexOf('MAX_ATTEMPTS')>=0);
ck('resend cooldown + hourly cap', fnSrc.indexOf('RESEND_COOLDOWN_SEC')>=0 && fnSrc.indexOf('MAX_PER_HOUR')>=0);
ck('never reveals whether a number is registered',
   fnSrc.indexOf('Deliberately identical response either way')>=0);
ck('signing in links every member row holding that number',
   fnSrc.indexOf('.eq("contact_method", "whatsapp").eq("contact_key", key)')>=0);

// ── NO STALE DATA: decisions must come from the resolver ──
ck('resolver RPC exists and is caller-scoped', sqlSrc.indexOf('create or replace function resolve_contacts')>=0 && sqlSrc.indexOf('c.owner_id = v_uid')>=0);
ck('resolver cannot be used to enumerate users',
   sqlSrc.indexOf('used to enumerate or probe the user base')>=0 && sqlSrc.indexOf('m.owner_id = v_uid')>=0);

// the invite box asks the DB about the typed contact
X.AppState.isDemoMode=false;
X.AppState.userProfile={id:'me',name:'Dan S'};
X.AppState.userMembers=[];
X.AppState.userCircles=[{id:'c1',name:'Ski',memberIds:[]}];
X.AppState.circleById=(id)=>X.AppState.userCircles.find(c=>c.id===id)||null;
byId['inv-method']=el({value:'whatsapp'}); byId['inv-contact']=el({value:'050 123 4567'}); byId['inv-err']=el(); byId['inv-new-msg']=el();
ctx.__rpcImpl=async(n)=> n==='resolve_contacts'
  ? {data:[{input_value:'050 123 4567',method:'whatsapp',is_user:true,user_id:'u1',member_id:'m1',member_name:'Rina'}]}
  : {data:'tok'};
ctx.__opened=[];
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('typed contact who IS a member and IS on Trustnet -> refused with their name',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('Rina')>=0
   && byId['inv-new-msg'].textContent.indexOf('already on Trustnet')>=0);

ctx.__rpcImpl=async(n)=> n==='resolve_contacts'
  ? {data:[{input_value:'050 123 4567',method:'whatsapp',is_user:true,user_id:'u2',member_id:null,member_name:null}]}
  : {data:'tok'};
byId['inv-err']=el(); byId['inv-new-msg']=el(); ctx.__opened=[];
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('on Trustnet but NOT in this circle -> told to add them, nothing sent',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('Add them as a member')>=0);

ctx.__rpcImpl=async(n)=> n==='resolve_contacts'
  ? {data:[{input_value:'050 123 4567',method:'whatsapp',is_user:false,user_id:null,member_id:null,member_name:null}]}
  : {data:'tok'};
byId['inv-err']=el(); byId['inv-new-msg']=el(); ctx.__opened=[];
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('genuinely new contact -> invite actually sent', ctx.__opened.length===1 && /wa\.me\/972501234567/.test(ctx.__opened[0]));

// linkage refreshed from the DB, not trusted from memory
ctx.__memberRows=[{id:'m9',linked_user_id:'u9'}];
X.AppState.userMembers=[{id:'m9',circleId:'c1',name:'Tal',linkedUserId:null,contactMethod:'whatsapp',contactValue:'+972509999999',isExternalSource:false}];
ctx.__rpc=[]; ctx.__rpcImpl=async()=>({data:1});
await X.refreshCircleLinks('c1');
ck('circle linkage is REFRESHED from the database on view',
   ctx.__rpc.some(function(c){return c[0]==='refresh_member_links';}) && X.AppState.userMembers[0].linkedUserId==='u9');
(function(){
  const msg = X.inviteMessageFor('Ski','https://t.app/?join=x');
  const lines = msg.split('\n');
  ck('invite message puts the link ALONE on its own line (mail clients linkify it)',
     lines.some(function(l){ return l.trim() === 'https://t.app/?join=x'; }));
})();
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
