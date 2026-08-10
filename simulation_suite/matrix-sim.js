// matrix-sim.js — EVERY member/circle/Trustnet combination (16 checks)
// Dimensions: in-this-circle? · in-another-circle? · has account (linked/unlinked/none)?
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={modalInvite,handleSaveMember,handleInviteMember,handleRecheckTrustnet,handleInviteNew,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:(sel)=>(ctx.__qs&&ctx.__qs[sel])?ctx.__qs[sel]:null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},open:(u)=>{ctx.__opened.push(u);},location:{href:'x',search:'',hash:'',origin:'https://t.app'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'https://t.app'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async(t)=>{ctx.__copied=t;}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.__opened=[];ctx.__copied='';ctx.__rpcCalls=[];
ctx.__inserts=[];
// v0.45.0: a brand-new contact now creates a people row + a person_contacts
// row before the membership. The old empty from() mock made that chain throw.
ctx.supabase={createClient:()=>({from:(t)=>({insert:(row)=>{ctx.__inserts.push([t,row]);
    return {select:()=>({single:async()=>({data:{id:'p-'+t},error:null})})};},
  upsert:async()=>({error:null}),delete:()=>({eq:()=>({not:async()=>({error:null})})}),
  select:()=>({eq:()=>({single:async()=>({data:null,error:null})})})}),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async(n,a)=>{ctx.__rpcCalls.push([n,a]); return ctx.__rpcImpl(n,a);},channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};openModal=function(n,p){globalThis.__opened_modal=[n,p];};'
 +'closeModal=function(){};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};uid=function(){return "new"+(++globalThis.__u);};'
 +'saveMembers=async function(){};saveCircles=async function(){};CURRENT_UID="me";',ctx);
ctx.__toasts=[];ctx.__u=0;
// v0.45.0: identity moved SERVER-SIDE. resolve_contact returns a STATE row,
// not the old bare boolean. Default: nobody holds this contact, no account.
ctx.__resolve={state:'free',person_id:null,person_name:null,membership_id:null,on_trustnet:false};
ctx.__rpcImpl=async(n)=>(n==='resolve_contact' ? {data:[ctx.__resolve],error:null} : {data:false});
const X=ctx.__x;
const lastToast=()=>ctx.__toasts.length?String(ctx.__toasts[ctx.__toasts.length-1][0]):'';
ck('APP_VERSION is v0.52.0', X.APP_VERSION==='v0.52.0 · live', X.APP_VERSION);

function reset() {
  byId['inv-new-msg']=el(); byId['inv-err']=el();
  ctx.__toasts=[]; ctx.__opened=[]; ctx.__rpcCalls=[];
  ctx.__resolve={state:'free',person_id:null,person_name:null,membership_id:null,on_trustnet:false};
  X.AppState.isDemoMode=false;
  X.AppState._authEmail='me@example.com';
  X.AppState._authPhone='+972500000000';
  X.AppState.userProfile={id:'me',name:'Dan S',avatar:'DS',avatarColor:'#217A4B',email:'me@example.com'};
  X.AppState.userCircles=[{id:'c1',name:'Ski',color:'#111',memberIds:['m1','m2','m3']},
                          {id:'c2',name:'Food',color:'#222',memberIds:['m4']}];
  X.AppState.circleById=function(id){return X.AppState.userCircles.find(function(c){return c.id===id;})||null;};
  X.AppState.userMembers=[
    {id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#1',contactMethod:'whatsapp',contactValue:'+972501111111',linkedUserId:'u1',isExternalSource:false},   // in circle, LINKED
    {id:'m2',circleId:'c1',name:'Yossi',avatar:'Y',avatarColor:'#2',contactMethod:'email',contactValue:'yossi@x.com',linkedUserId:null,isExternalSource:false},        // in circle, unlinked
    {id:'m3',circleId:'c1',name:'Noa',avatar:'N',avatarColor:'#3',contactMethod:'app',contactValue:'',linkedUserId:null,isExternalSource:false},                       // in circle, no contact
    {id:'m4',circleId:'c2',name:'Tal',avatar:'T',avatarColor:'#4',contactMethod:'whatsapp',contactValue:'+972504444444',linkedUserId:'u4',isExternalSource:false}];    // ANOTHER circle, linked
}
function form(o) {
  ctx.__qs = { '.modal-body[data-circle-id]': { dataset: { circleId: 'c1', editId: '' } } };
  byId['nm-name']=el({value:o.name||''}); byId['nm-trust']=el({value:''});
  byId['nm-method']=el({value:o.method||'whatsapp'}); byId['nm-rate']=el({value:'high'});
  byId['nm-contact']=el({value:o.contact||''}); byId['nm-src-name']=el({value:''});
}

// ── the invite modal across the matrix ──
reset();
const im=X.modalInvite({circleId:'c1',circleName:'Ski'});
ck('1. in-circle + LINKED  -> shown as on Trustnet, no invite button',
   im.indexOf('ALREADY ON TRUSTNET')>=0 && im.indexOf('Rina')>=0 && im.indexOf('data-member-id="m1"')<0);
ck('3. in-circle + no account -> invite button on their channel',
   im.indexOf('data-action="invite-member" data-member-id="m2"')>=0 && im.indexOf('Email invite')>=0);
ck('4. in-circle + no contact -> offered "Add a number", not an invite',
   im.indexOf('NO CONTACT DETAILS')>=0 && im.indexOf('data-member-id="m3"')>=0 && im.indexOf('Add a number')>=0);
ck('members of OTHER circles are not listed here', im.indexOf('Tal')<0);
ck('2. unlinked members trigger the "who is already on Trustnet" re-check',
   im.indexOf('recheck-trustnet')>=0);

// ── adding: every combination ──
reset(); ctx.__resolve={state:'in_circle',person_id:'p1',person_name:'Rina',membership_id:'m1',on_trustnet:true};
form({name:'Rina', method:'whatsapp', contact:'+972501111111'});
await X.handleSaveMember();
ck('5. adding someone ALREADY in this circle -> refused, no duplicate',
   lastToast().indexOf('already in this circle')>=0 && X.AppState.userMembers.length===4);

// The SERVER normalises (+972 vs 0) — proven against real Postgres in
// resolver-sim. Here we assert the CLIENT honours the answer it is given.
reset(); ctx.__resolve={state:'in_circle',person_id:'p1',person_name:'Rina',membership_id:'m1',on_trustnet:true};
form({name:'Rina Cohen', method:'whatsapp', contact:'0501111111'});
await X.handleSaveMember();
ck('5b. duplicate caught across phone FORMATS (+972 vs 0)',
   lastToast().indexOf('already in this circle')>=0 && X.AppState.userMembers.length===4);

reset(); ctx.__resolve={state:'found_person',person_id:'p9',person_name:'Tal',membership_id:null,on_trustnet:true}; form({name:'Tal', method:'whatsapp', contact:'+972504444444'});
await X.handleSaveMember();
const added=X.AppState.userMembers.find(function(m){return m.circleId==='c1' && m.name==='Tal';});
// v0.45.0: the "also in Food" toast is GONE — the app now ASKS (dan's rule:
// one contact is one person, but the human confirms) and then REUSES that
// person instead of minting a second one. Reuse is the point; the toast was
// only ever a consolation for not having a person model.
ck('6. someone from ANOTHER circle -> reuses the SAME person, no new people row',
   !!added && added.personId==='p9' && !!added.linkedUserId
   && !ctx.__inserts.some(function(i){return i[0]==='people';}),
   JSON.stringify({p:added&&added.personId, l:added&&added.linkedUserId,
                   ins:ctx.__inserts.map(function(i){return i[0];})}));

reset(); form({name:'Me', method:'email', contact:'me@example.com'});
await X.handleSaveMember();
ck('7. adding YOURSELF by email -> refused', lastToast().indexOf("you don't add yourself")>=0 && X.AppState.userMembers.length===4);

reset(); form({name:'Me', method:'whatsapp', contact:'+972 50-000-0000'});
await X.handleSaveMember();
ck('8. adding YOURSELF by PHONE -> refused (was unguarded)',
   lastToast().indexOf('your own number')>=0 && X.AppState.userMembers.length===4);

reset(); ctx.__resolve={state:'free',person_id:null,person_name:null,membership_id:null,on_trustnet:true};
form({name:'Newbie', method:'email', contact:'new@x.com'});
await X.handleSaveMember();
ck('9. brand-new contact who HAS an account -> resolved server-side and linked',
   ctx.__rpcCalls.some(function(c){return c[0]==='resolve_contact';}) &&
   X.AppState.userMembers.some(function(m){return m.contactValue==='new@x.com' && m.linkedUserId;}));

reset(); form({name:'Stranger', method:'email', contact:'nobody@x.com'});
await X.handleSaveMember();
ck('10. brand-new contact with NO account -> added quietly, no false claim',
   X.AppState.userMembers.length===5 && !ctx.__toasts.some(function(t){return String(t[0]).indexOf('already on Trustnet')>=0;}));

// ── invite actions across states ──
reset(); ctx.__rpcImpl=async()=>({data:'tok'});
await X.handleInviteMember(el({dataset:{memberId:'m1',circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('11. inviting a LINKED member -> refused, said INLINE where you can see it',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('already on Trustnet')>=0);

reset(); ctx.__rpcImpl=async()=>({data:'tok'});
await X.handleInviteMember(el({dataset:{memberId:'m3',circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('12. inviting a member with NO contact -> clear error, nothing opened',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('No contact details')>=0);

reset(); ctx.__rpcImpl=async()=>({data:'tok'});
await X.handleInviteMember(el({dataset:{memberId:'m2',circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('13. inviting an unlinked EMAIL member -> mailto with the join link',
   ctx.__opened.length===1 && ctx.__opened[0].indexOf('mailto:yossi%40x.com')>=0 && decodeURIComponent(ctx.__opened[0]).indexOf('join=tok')>=0);

// ── the re-check sweep ──
reset();
// v0.47.0: the sweep now calls resolve_contact. link_member_to_existing_user
// queried auth.users.phone — A COLUMN THAT DOES NOT EXIST — so it threw on every
// whatsapp member and the caller reported the crash as "no account".
vm.runInContext('loadUserData = async function(){};', ctx);
let calls=0; ctx.__rpcImpl=async(n)=>{
  if(n==='resolve_contact'){calls++; return {data:[{state:'free',person_id:null,person_name:null,membership_id:null,on_trustnet:calls===1}],error:null};}
  return {data:'tok'}; };
await X.handleRecheckTrustnet(el({dataset:{circleId:'c1'},disabled:false,textContent:''}));
ck('14. re-check asks only about UNLINKED members with contacts (m2 only)',
   calls===1 && ctx.__rpcCalls.filter(function(c){return c[0]==='resolve_contact';}).length===1,
   'calls='+calls);
// v0.47.0: the reopen goes through openInviteFresh, which AWAITS a fresh load
// before rendering — the invite dialog must never bucket from stale memory
// (that is how a linked person was shown as a stranger and emailed an invite).
// So the reopen completes a tick later than it used to.
await new Promise(function(r){ setTimeout(r, 0); });
ck('15. re-check reports what it found and reopens the list',
   lastToast().indexOf('already on Trustnet')>=0 && ctx.__opened_modal && ctx.__opened_modal[0]==='invite',
   lastToast() + ' | opened=' + JSON.stringify(ctx.__opened_modal));
// ── inviting someone who is NOT a member yet (restored in v0.33.1) ──
reset(); ctx.__rpcImpl=async()=>({data:'tok'});
const im3=X.modalInvite({circleId:'c1',circleName:'Ski'});
ck('16. modal offers WhatsApp AND Email for someone new',
   im3.indexOf('INVITE SOMEONE NEW')>=0 && im3.indexOf('data-action="invite-new"')>=0
   && im3.indexOf('>WhatsApp<')>=0 && im3.indexOf('>Email<')>=0 && im3.indexOf('id="inv-contact"')>=0);
ck('17. the one-link option is still there too', im3.indexOf('invite-copy-link')>=0);

byId['inv-method']=el({value:'whatsapp'}); byId['inv-contact']=el({value:'050 987 6543'}); byId['inv-err']=el(); byId['inv-new-msg']=el();
ctx.__opened=[];
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('18. new WhatsApp invite normalises the number and opens wa.me with the link',
   ctx.__opened.length===1 && /wa\.me\/972509876543/.test(ctx.__opened[0]) && decodeURIComponent(ctx.__opened[0]).indexOf('join=tok')>=0);

byId['inv-method']=el({value:'email'}); byId['inv-contact']=el({value:'new@friend.com'}); ctx.__opened=[];
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('19. new email invite opens mailto with the link',
   ctx.__opened.length===1 && ctx.__opened[0].indexOf('mailto:new%40friend.com')>=0);

byId['inv-method']=el({value:'whatsapp'}); byId['inv-contact']=el({value:'+972501111111'}); ctx.__opened=[]; byId['inv-err']=el(); byId['inv-new-msg']=el();
// The refusal now comes from the RESOLVER (asked live), not a local cache.
const prevImpl = ctx.__rpcImpl;
ctx.__rpcImpl = async (n) => n === 'resolve_contacts'
  ? { data: [{ input_value: '+972501111111', method: 'whatsapp', is_user: true, user_id: 'u1', member_id: 'm1', member_name: 'Rina' }] }
  : { data: 'tok' };
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('20. inviting a number that is ALREADY a linked member -> refused (via live resolve)',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('already in this circle')>=0
   && byId['inv-new-msg'].textContent.indexOf('Rina')>=0);
ctx.__rpcImpl = prevImpl;

byId['inv-contact']=el({value:'not-a-number'}); ctx.__opened=[]; byId['inv-err']=el(); byId['inv-new-msg']=el();
await X.handleInviteNew(el({dataset:{circleId:'c1',circleName:'Ski'},disabled:false,textContent:''}));
ck('21. invalid contact -> error, nothing opened', ctx.__opened.length===0 && byId['inv-new-msg'].textContent.length>0);

// ── the reason it was invisible: modals must SCROLL, and the primary action first
const cssSrc = require('fs').readFileSync('/home/claude/app/index.html','utf8');
ck('22. modal body is the single scroll area, height measured not guessed',
   cssSrc.indexOf('flex: 1 1 auto; min-height: 0; overflow-y: auto;')>=0
   && cssSrc.indexOf('function sizeModalToViewport')>=0);
const im4=X.modalInvite({circleId:'c1',circleName:'Ski'});
ck('23. the invite FORM comes before the member list',
   im4.indexOf('INVITE SOMEONE NEW') < im4.indexOf('ALREADY ON TRUSTNET'));
ck('24. every section still present',
   ['INVITE SOMEONE NEW','ALREADY ON TRUSTNET','NOT ON TRUSTNET YET','NO CONTACT DETAILS','recheck-trustnet','OR SHARE ONE LINK']
     .every(function(k){ return im4.indexOf(k)>=0; }));
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
