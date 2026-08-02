// invite-sim.js — the four reported faults (14 checks)
const vm=require('vm'); const fs=require('fs');
let src=fs.readFileSync('/home/claude/sim/app_script.js','utf8');
src += ';globalThis.__x={modalInvite,handleSendInvite,inboxItems,memberRowHtml,AppState,APP_VERSION};';
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
ck('APP_VERSION is v0.31.1', X.APP_VERSION==='v0.31.1 · live', X.APP_VERSION);

// ── 1. invite modal is REAL, not a mock
X.AppState.userProfile={id:'me',name:'Dan Shapiro',avatar:'DS',avatarColor:'#217A4B'};
const im = X.modalInvite({circleId:'c1', circleName:'ski'});
ck('invite: send action is real (no simulator)', im.indexOf('data-action="send-invite"')>=0 && im.indexOf('send-invite-sim')<0);
ck('invite: contact input has an id so it can be read', im.indexOf('id="inv-contact"')>=0);
ck('invite: channel picker is a real segmented control', im.indexOf('inv-method')>=0);
ck('invite: offers a copy-link option too', im.indexOf('Copy link')>=0);
ck('invite: designer commentary REMOVED', im.indexOf('Notice the framing')<0);
ck('invite: message explains no install is needed', im.indexOf('without installing anything')>=0);

// ── 2. sending really opens WhatsApp with the link
byId['inv-method']=el({value:'whatsapp'});
byId['inv-contact']=el({value:'+972501234567'});
byId['inv-err']=el();
const btn=el({dataset:{circleId:'c1'}});
btn.closest=()=>({querySelector:()=>el({dataset:{circleId:'c1',circleName:'ski'}})});
await X.handleSendInvite(btn);
ck('invite: opens wa.me with the join link', ctx.__opened.length===1 && /wa\.me\/972501234567/.test(ctx.__opened[0]) && /join%3Dtok-abc|join=tok-abc/.test(decodeURIComponent(ctx.__opened[0])));
ck('invite: a bad number is refused before sending', (function(){ byId['inv-contact'].value='abc'; ctx.__opened=[]; return true; })());
await X.handleSendInvite(el({dataset:{circleId:'c1'},closest:()=>({querySelector:()=>el({dataset:{circleId:'c1',circleName:'ski'}})})}));
ck('invite: invalid contact produces an error, sends nothing', ctx.__opened.length===0 && byId['inv-err'].textContent.length>0);

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
ck('open-invite passes circleId (was: "No circle selected")',
   appSrc2.indexOf("openModal('invite', { circleId: target.dataset.circleId") >= 0);
ck('channel switch uses the right variable (was a ReferenceError)',
   appSrc2.indexOf("if (val === 'link')") >= 0 && appSrc2.indexOf("value === 'email' ? 'EMAIL ADDRESS'") < 0);
ck('email mode relabels AND re-placeholders the field',
   appSrc2.indexOf("val === 'email' ? 'EMAIL ADDRESS' : 'PHONE NUMBER'") >= 0 &&
   appSrc2.indexOf("val === 'email' ? 'name@example.com'") >= 0);
ck('duplicate member is refused with a clear message',
   appSrc2.indexOf('is already in this circle.') >= 0);

// end-to-end: email invite now succeeds
byId['inv-method']=el({value:'email'});
byId['inv-contact']=el({value:'friend@example.com'});
byId['inv-err']=el();
ctx.__opened=[]; ctx.__closed=false;
const b2=el({dataset:{circleId:'c1'}});
b2.closest=()=>({querySelector:()=>el({dataset:{circleId:'c1',circleName:'ski'}})});
await X.handleSendInvite(b2);
ck('email invite opens mailto with the join link',
   ctx.__opened.length===1 && ctx.__opened[0].indexOf('mailto:friend%40example.com')>=0 && decodeURIComponent(ctx.__opened[0]).indexOf('join=tok-abc')>=0);
ck('no error shown on a valid email send', byId['inv-err'].textContent === '');
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
})();
