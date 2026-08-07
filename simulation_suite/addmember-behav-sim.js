const vm=require('vm'), fs=require('fs');
const web=fs.readFileSync('/home/claude/app/index.html','utf8');
let app=web.slice(web.indexOf('<script>',web.indexOf('supabase.min.js'))+8);
app=app.slice(0,app.indexOf('</script>'));
app+=';globalThis.__x={handleSaveMember,resolveContact,AppState};';
let pass=0,fail=0; const ck=(n,c,x)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');}};
const fields={'nm-type':'person','nm-name':'Itamar','nm-trust':'friend','nm-method':'email','nm-rate':'high','nm-contact':'itamar@x.com'};
let rpcReply; const inserted=[], toasts=[]; let confirmAns=true;
const el=(id)=>({value:fields[id]!==undefined?fields[id]:'',style:{},dataset:{circleId:'c1',editId:''},
  textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){},appendChild(){},remove(){},focus(){},querySelector:()=>null,querySelectorAll:()=>[]});
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:(id)=>el(id),createElement:()=>el(),querySelector:(s)=>String(s).indexOf('modal-body')>=0?el('body'):null,
   querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},innerWidth:390,innerHeight:664,visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u'+Math.random(),subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>confirmAns,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:function(){ return {
  rpc:async(fn,args)=>rpcReply(fn,args),
  from:(t)=>({insert:(row)=>{inserted.push({t,row});return {select:()=>({single:async()=>({data:{id:'new-'+t},error:null})})};},
    upsert:async()=>({error:null}),delete:()=>({eq:()=>({not:async()=>({error:null})})}),
    select:()=>({eq:()=>({single:async()=>({data:null,error:null})})})}),
  auth:{onAuthStateChange:function(){},getSession:async()=>({data:{session:{access_token:'t'}}})},channel:()=>({})};}};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app,ctx,{filename:'app.js'});
vm.runInContext("renderApp=function(){};showView=function(){};closeModal=function(){};loadUserData=async function(){};"
 +"toast=function(m,k){globalThis.__t.push(m);};CURRENT_UID='me';saveCircles=async function(){};",ctx);
ctx.__t=toasts; const X=ctx.__x;
X.AppState.userProfile={id:'me',name:'Dan'}; X.AppState.userMembers=[]; X.AppState.userCircles=[{id:'c1',name:'ski',memberIds:[]}];
(async()=>{
  // 1. FREE contact -> person + contact created, member saved
  rpcReply=async()=>({data:[{state:'free',person_id:null,person_name:null,membership_id:null,on_trustnet:false}],error:null});
  inserted.length=0;toasts.length=0; await X.handleSaveMember();
  ck('new contact creates a people row', inserted.some(i=>i.t==='people'));
  ck('...and a person_contacts row', inserted.some(i=>i.t==='person_contacts'));
  ck('...with the normalised key', (inserted.find(i=>i.t==='person_contacts')||{row:{}}).row.key==='itamar@x.com');
  // 2. IN_CIRCLE -> refuses, creates nothing
  rpcReply=async()=>({data:[{state:'in_circle',person_id:'p1',person_name:'Itamar',membership_id:'m1',on_trustnet:true}],error:null});
  inserted.length=0;toasts.length=0; X.AppState.userMembers=[]; await X.handleSaveMember();
  ck('already in circle -> nothing created', inserted.length===0);
  ck('...and says so', toasts.some(t=>/already in this circle/i.test(t)), toasts.join('|'));
  // 3. FOUND_PERSON + confirm YES -> reuses person, no new people row
  rpcReply=async()=>({data:[{state:'found_person',person_id:'p9',person_name:'Itamar Cohen',membership_id:null,on_trustnet:true}],error:null});
  inserted.length=0;toasts.length=0;confirmAns=true; X.AppState.userMembers=[]; await X.handleSaveMember();
  ck('known contact reuses the person (no new people row)', !inserted.some(i=>i.t==='people'));
  // 4. FOUND_PERSON + confirm NO -> nothing at all
  inserted.length=0;toasts.length=0;confirmAns=false; X.AppState.userMembers=[]; await X.handleSaveMember();
  ck('declining the merge creates nothing', inserted.length===0);
  ck('...and explains why', toasts.some(t=>/if this is a different person/i.test(t)), toasts.join('|'));
  // 5. RPC ERROR -> abort, never "assume stranger"
  rpcReply=async()=>({data:null,error:{message:'boom'}});
  inserted.length=0;toasts.length=0;confirmAns=true; X.AppState.userMembers=[]; await X.handleSaveMember();
  ck('a resolver failure creates NOTHING', inserted.length===0);
  ck('...and tells the user it could not check', toasts.some(t=>/Couldn't check/i.test(t)), toasts.join('|'));

  // ── dan's report: typed "yoram", was told "dan test2 already exists", with
  // no way to see that the EMAIL was the reason. And under his own rule the
  // contact decides identity — so that add creates DAN TEST2, not yoram. The
  // old message never said so.
  fields['nm-name']='yoram'; fields['nm-contact']='dshapiro1962@gmail.com';
  rpcReply=async()=>({data:[{state:'in_circle',person_id:'p2',person_name:'dan test2',membership_id:'m2',on_trustnet:true}],error:null});
  inserted.length=0;toasts.length=0; X.AppState.userMembers=[]; await X.handleSaveMember();
  ck('in_circle message names the CONTACT that is taken',
     toasts.some(t=>String(t).indexOf('dshapiro1962@gmail.com')>=0), toasts.join('|'));
  ck('...and who holds it', toasts.some(t=>String(t).indexOf('dan test2')>=0));
  ck('...and says nothing was added', toasts.some(t=>/Nothing was added/i.test(String(t))));
  ck('...and creates nothing', inserted.length===0);

  // found_person: the typed name must be REPLACED by the contact holder's
  rpcReply=async()=>({data:[{state:'found_person',person_id:'p2',person_name:'dan test2',membership_id:null,on_trustnet:true}],error:null});
  inserted.length=0;toasts.length=0;confirmAns=true; X.AppState.userMembers=[]; await X.handleSaveMember();
  const saved = X.AppState.userMembers[X.AppState.userMembers.length-1];
  ck('the CONTACT decides the name, not what was typed',
     !!saved && saved.name==='dan test2', saved && saved.name);
  ck('...and the existing person is reused, not duplicated',
     !!saved && saved.personId==='p2' && !inserted.some(i=>i.t==='people'));
  console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
})();
