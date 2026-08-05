// longlist-sim.js — a circle with MANY members must still be fully reachable.
// dan's question: "will the scroll work with a long list of circle members?"
const vm=require('vm'); const fs=require('fs');
const src=fs.readFileSync('/home/claude/app/index.html','utf8');
let app=src.slice(src.indexOf('<script>', src.indexOf('supabase.min.js'))+8);
app=app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={modalInvite,sizeModalToViewport,AppState,APP_VERSION};';
const el=(o)=>{const e=Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',className:'',
  scrollTop:0,scrollHeight:0,clientHeight:0,appendChild(){},remove(){},
  querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null,addEventListener(){},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},focus(){}},o||{}); return e;};
const modalEl=el({className:'modal'});
const overlayEl=el({className:'modal-overlay'});
overlayEl.querySelector=(s)=> s.indexOf('.modal')>=0 ? modalEl : null;
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:()=>el(),createElement:(t)=>el({tag:t}),
   querySelector:(s)=>{ if(s==='.modal-overlay') return overlayEl; if(s.indexOf('.modal')>=0) return modalEl; return null; },
   querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),
   hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'},navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}),crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams,TextEncoder,AbortController,confirm:()=>true,alert(){},prompt(){},history:{replaceState(){},pushState(){}}};
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},rpc:async()=>({data:[]}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
let pass=0,fail=0; const ck=(n,c,x)=>{ if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n,x||'');} };
vm.runInContext(app,ctx,{filename:'app.js'});
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";',ctx);
const X=ctx.__x;

// ── build a deliberately punishing circle: 60 members across all three groups ──
const N=60; const members=[];
for (let i=0;i<N;i++){
  const mode=i%3;
  members.push({ id:'m'+i, circleId:'c1', name:'Member Number '+(i+1),
    linkedUserId: mode===0 ? 'u'+i : null,
    contactValue: mode===1 ? '+9725055500'+(i%10) : '',
    contactMethod:'whatsapp', isExternalSource:false });
}
X.AppState.userMembers=members;
X.AppState.userProfile={ name:'Dan Shapiro' };
X.AppState.isDemoMode=true;

const html=X.modalInvite({ circleId:'c1', circleName:'ski' });

// 1. NOTHING may be silently dropped.
let shown=0; for(let i=1;i<=N;i++){ if(html.indexOf('Member Number '+i+'<')>=0) shown++; }
ck('all '+N+' members render — nothing truncated', shown===N, 'rendered '+shown);

// 2. ONE scroll container. Nested scrollers on iOS fight each other.
const bodies=(html.match(/class="modal-body"/g)||[]).length;
ck('exactly one .modal-body (the single scroll container)', bodies===1, 'found '+bodies);
ck('no nested scroller inside the modal', !/overflow(-y)?\s*:\s*(auto|scroll)/.test(html),
   (html.match(/overflow[^;"]*/)||[''])[0]);
ck('no inline max-height capping the list', !/max-height/.test(html));

// 3. The list must live INSIDE the scroll container, not after it.
const bodyStart=html.indexOf('class="modal-body"');
ck('member list sits inside the scrolling body',
   html.indexOf('Member Number 60<') > bodyStart);

// 4. The modal must still be capped to the visible viewport.
X.sizeModalToViewport();
const cap=parseInt(modalEl.style.maxHeight,10);
ck('modal capped to visible viewport, not content height', cap>0 && cap<=664,
   'maxHeight '+modalEl.style.maxHeight);
ck('overlay pinned to visible viewport', overlayEl.style.height==='664px');

// 5. SAFE AREA — the reason this matters more since v0.35.1.
// Until now the tab bar covered the modal's bottom, so nobody noticed that
// nothing in the modal reserves room for the home indicator. Now the modal
// correctly reaches the bottom of the screen, the last row lands in the
// home-indicator strip: hard to tap, and an upward swipe there is claimed by
// iOS as the home gesture instead of scrolling the list.
// Extract the EXACT declarations, not "somewhere near them" — the original
// suite's safe-area check passed only because the tab bar's env() lived
// elsewhere in the file. A test that can't fail isn't a test.
const mq = src.slice(src.indexOf('.modal-overlay { align-items: center; padding: 12px; }'));
const mobModal = (mq.match(/\.modal \{[^}]*\}/)||[''])[0];
const mobBody  = (mq.match(/\.modal-body \{[^}]*\}/)||[''])[0];
const mobFoot  = (mq.match(/\.modal-footer \{[^}]*\}/)||[''])[0];
ck('sanity: the mobile rules were actually found',
   mobModal.length>0 && mobBody.length>0 && mobFoot.length>0);
ck('something in the phone modal reserves the home-indicator strip',
   /env\(safe-area-inset-bottom/.test(mobModal+mobBody+mobFoot),
   'modal='+mobModal.trim()+' body='+mobBody.trim()+' foot='+mobFoot.trim());
ck('safe-area padding is component-scoped, never page-wide (rule 11)',
   src.indexOf('viewport-fit=cover')<0);
ck('box-sizing:border-box is global, so padding cannot ADD height (the bug that doubled the tab bar)',
   src.indexOf('*, *::before, *::after { box-sizing: border-box;')>=0);

console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
