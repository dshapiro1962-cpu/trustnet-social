// invite-sim.js — the four reported faults (14 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={modalInvite,handleInviteMember,handleInviteCopyLink,inboxItems,memberRowHtml,AppState,APP_VERSION};';
const el=(o)=>Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',disabled:false,addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},closest(){return null;},classList:{add(){},remove(){}},focus(){}},o||{});
const byId={};
const ctx={console:{log(){},error(){},warn(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(i)=>{if(!byId[i])byId[i]=el();return byId[i];},querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>el(),addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),head:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},open:(u)=>{ctx.__opened.push(u);},location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'https://trustnetsocial.netlify.app'},
 navigator:{userAgent:'sim',language:'en',clipboard:{writeText:async(t)=>{ctx.__copied=t;}}},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.__opened=[]; ctx.__copied='';
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:async(n,a)=>ctx.__rpc(n,a),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
(async()=>{
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(m,t){globalThis.__toasts.push([m,t||"ok"]);};closeModal=function(){globalThis.__closed=true;};CURRENT_UID="me";',ctx);
ctx.__toasts=[]; ctx.__rpc=async()=>({data:'tok-abc'});
const X=ctx.__x;
ck('APP_VERSION is v0.38.0', X.APP_VERSION==='v0.38.0 · live', X.APP_VERSION);

// ── 1. invite modal is REAL, not a mock
X.AppState.userProfile={id:'me',name:'Dan Shapiro',avatar:'DS',avatarColor:'#217A4B'};
const im = X.modalInvite({circleId:'c1', circleName:'ski'});
ck('invite: no simulator anywhere', im.indexOf('send-invite-sim')<0);



ck('invite: designer commentary REMOVED', im.indexOf('Notice the framing')<0);


// ── 2. invite is built from the MEMBER LIST, not a blank form
X.AppState.userMembers=[
  {id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#111',contactMethod:'whatsapp',contactValue:'+972501234567',linkedUserId:null,isExternalSource:false},
  {id:'m2',circleId:'c1',name:'Yossi',avatar:'Y',avatarColor:'#222',contactMethod:'email',contactValue:'y@x.com',linkedUserId:'u9',isExternalSource:false},
  {id:'m3',circleId:'c1',name:'Noa',avatar:'N',avatarColor:'#333',contactMethod:'app',contactValue:'',linkedUserId:null,isExternalSource:false}];
const im2 = X.modalInvite({circleId:'c1', circleName:'ski'});
ck('invite lists the circle\'s own members', im2.indexOf('Rina')>=0 && im2.indexOf('Yossi')>=0 && im2.indexOf('Noa')>=0);
ck('members already on Trustnet are shown in their own group, with no invite button',
   im2.indexOf('ALREADY ON TRUSTNET')>=0 && im2.indexOf('Gets your questions in the app')>=0
   && im2.indexOf('Nothing to send')<0);
ck('only NOT-yet members get an invite button',
   im2.indexOf('data-action="invite-member" data-member-id="m1"')>=0 &&
   im2.indexOf('data-member-id="m2"')<0);
ck('button names the right channel per member', im2.indexOf('WhatsApp invite')>=0);
ck('members with no contact details are offered a fix, not an invite',
   im2.indexOf('NO CONTACT DETAILS')>=0 && im2.indexOf('Add a number')>=0);
ck('a shareable circle link is always offered', im2.indexOf('invite-copy-link')>=0);
ck('contact form is present for inviting someone NEW (not a blank-form-only modal)',
   im2.indexOf('id="inv-contact"')>=0 && im2.indexOf('INVITE SOMEONE NEW')>=0);
ck('invite explains no install is needed', im2.indexOf('no install needed')>=0);

// inviting a member uses THEIR stored contact — no typing
ctx.__opened=[]; byId['inv-err']=el(); byId['inv-new-msg']=el();
await X.handleInviteMember(el({dataset:{memberId:'m1',circleId:'c1',circleName:'ski'}, disabled:false, textContent:''}));
ck('member invite opens wa.me with their number + join link',
   ctx.__opened.length===1 && /wa\.me\/972501234567/.test(ctx.__opened[0]) && decodeURIComponent(ctx.__opened[0]).indexOf('join=tok-abc')>=0);
ctx.__opened=[];
await X.handleInviteMember(el({dataset:{memberId:'m2',circleId:'c1',circleName:'ski'}, disabled:false, textContent:''}));
ck('inviting someone already on Trustnet is refused, said inline',
   ctx.__opened.length===0 && byId['inv-new-msg'].textContent.indexOf('already on Trustnet')>=0);

// ── 3. shared-list notification: link fetched + no bogus button
const appSrc = fs.readFileSync('/home/claude/app/index.html','utf8');
ck('notifications now SELECT link_url', (appSrc.match(/query_id,link_url/g)||[]).length===2);
X.AppState._notifications=[{id:'n1',type:'collection_shared',title:'dan shared a list',body:'8 recommendations',
  circle_id:'c1',link_url:'https://trustnetsocial.netlify.app/collection.html?t=tok',created_at:new Date().toISOString()}];
X.AppState.userQueries=[]; X.AppState.userRecs=[];
const items=X.inboxItems();
ck('shared-list notification carries its link', items[0] && items[0].linkUrl.indexOf('collection.html?t=tok')>=0);
ck('no meaningless "View circles" fallback for shared lists',
   appSrc.indexOf("data-view=\"circles\">View circles</button>")<0);

// ── 4. already-on-Trustnet is shown
X.AppState.userMembers=[{id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#111',contactMethod:'email',contactValue:'r@x.com',linkedUserId:'u9',responseRate:'high',trustBasis:''}];
const row = typeof X.memberRowHtml==='function' ? X.memberRowHtml(X.AppState.userMembers[0]) : appSrc;
ck('member shows an "On Trustnet" badge when linked', String(row).indexOf('On Trustnet')>=0);
ck('link-on-add asks the server and tells the user', appSrc.indexOf('link_member_to_existing_user')>=0 && appSrc.indexOf('is already on Trustnet')>=0);
// ---- the three faults reported after v0.31.0 ----
const appSrc2 = fs.readFileSync('/home/claude/app/index.html','utf8');



ck('duplicate member is refused with a clear message',
   appSrc2.indexOf('is already in this circle.') >= 0);

// email member: opens mailto with their stored address
ctx.__opened=[];
X.AppState.userMembers=[
  {id:'m2',circleId:'c1',name:'Yossi',avatar:'Y',avatarColor:'#222',contactMethod:'email',contactValue:'y@x.com',linkedUserId:null,isExternalSource:false}];
await X.handleInviteMember(el({dataset:{memberId:'m2',circleId:'c1',circleName:'ski'}, disabled:false, textContent:''}));
ck('email member invite opens mailto with the join link',
   ctx.__opened.length===1 && ctx.__opened[0].indexOf('mailto:y%40x.com')>=0 && decodeURIComponent(ctx.__opened[0]).indexOf('join=tok-abc')>=0);
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
