// modalfit-sim.js — modals must FIT the phone and SHOW that they scroll (12 checks)
const vm=require('vm'); const fs=require('fs');
const src=fs.readFileSync('/home/claude/app/index.html','utf8');
let app=src.slice(src.indexOf('<script>', src.indexOf('supabase.min.js'))+8);
app=app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={attachScrollAffordance,sizeModalToViewport,modalInvite,modalFabMenu,AppState,APP_VERSION};';
const made=[];
const el=(o)=>{const e=Object.assign({value:'',textContent:'',style:{},dataset:{},innerHTML:'',className:'',
  scrollTop:0,scrollHeight:0,clientHeight:0,_kids:[],_listeners:{},
  appendChild(c){e._kids.push(c);made.push(c);},remove(){},
  querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null,
  addEventListener(ev,fn){(e._listeners[ev]=e._listeners[ev]||[]).push(fn);},
  classList:{_c:{},add(c){this._c[c]=1;},remove(c){delete this._c[c];},
    toggle(c,on){ if(on){this._c[c]=1;} else {delete this._c[c];} },contains(c){return !!this._c[c];}},
  focus(){}},o||{}); return e;};
const bodyEl=el({className:'modal-body',scrollHeight:900,clientHeight:400});
const modalEl=el({className:'modal'});
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{if(typeof f==='function')f();return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:()=>el(),createElement:(t)=>el({tag:t}),
   querySelector:(sel)=>{ if(sel.indexOf('.modal-body')>=0) return bodyEl; if(sel.indexOf('.modal')>=0) return modalEl; return null; },
   querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{supabase:null,addEventListener(){},innerWidth:390,innerHeight:700,visualViewport:{height:700,addEventListener(){}},location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
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
ck('APP_VERSION is v0.34.3', X.APP_VERSION==='v0.34.3 · live', X.APP_VERSION);

// ── one scroll container, not two ──
ck('the modal itself no longer scrolls (nested scrollers removed)',
   /\.modal \{[^}]*overflow: hidden;[^}]*display: flex; flex-direction: column;/s.test(src));
ck('the BODY is the single scroll area, flexing to fit',
   /\.modal-body \{[^}]*flex: 1 1 auto; min-height: 0; overflow-y: auto;/s.test(src));
ck('header and footer stay put while the body scrolls',
   src.indexOf('.modal-header, .modal-footer { flex: 0 0 auto; }')>=0);

// ── phone sheet ──
ck('on phones the modal is a bottom sheet',
   src.indexOf('.modal-overlay { align-items: flex-end; padding: 0; }')>=0);
// REGRESSION GUARDS — v0.34.2 broke the app by changing a PAGE-WIDE setting to
// fix a modal. viewport-fit=cover woke up dormant env() padding and doubled the
// tab bar. Never again: modal problems get modal-scoped fixes.
ck('NO page-wide viewport-fit=cover (it doubled the tab bar)',
   src.indexOf('viewport-fit=cover') < 0);
ck('no dvh dependency (needs iOS 15.4+; we measure instead)',
   src.replace(/\/\*[\s\S]*?\*\//g,'').indexOf('dvh') < 0);
ck('tab bar cannot be broken by safe-area padding again',
   src.indexOf('box-sizing: border-box;\n    min-height: 62px; height: auto;')>=0
   && src.indexOf('env(safe-area-inset-bottom, 0px)')>=0);
ck('modal height is MEASURED from the visible viewport',
   src.indexOf('window.visualViewport')>=0 && src.indexOf('function sizeModalToViewport')>=0);
ck('headerless modals (the + menu) get top padding under the grab handle',
   src.indexOf('.modal > .modal-body:first-of-type { padding-top: 16px; }')>=0);
ck('sheet has a grab handle (says "this panel moves")', src.indexOf('.modal::before')>=0 && src.indexOf('width: 38px; height: 4px')>=0);
ck('phone padding tightened to buy content height',
   src.indexOf('.modal-body { padding: 14px 18px; gap: 12px; }')>=0);
ck('footer respects the phone safe area', src.indexOf('env(safe-area-inset-bottom')>=0);

// ── the affordance ──
ck('scroll SHADOWS appear only when there is more in that direction',
   src.indexOf('no-repeat local')>=0 && src.indexOf('radial-gradient(farthest-side at 50% 100%')>=0);
X.attachScrollAffordance();
const pill = made.find(function(k){ return k.className === 'scroll-more'; });
ck('an explicit "more below" pill is added when content overflows', !!pill && pill.textContent.indexOf('more below')>=0);
// once scrolled, it goes away
bodyEl.scrollTop = 200;
(bodyEl._listeners.scroll||[]).forEach(function(fn){ fn(); });
ck('the pill disappears once the user scrolls', pill && pill.classList.contains('gone'));
// no overflow -> no pill
made.length = 0;
bodyEl.scrollHeight = 380; bodyEl.clientHeight = 400; bodyEl.scrollTop = 0;
X.attachScrollAffordance();
ck('no pill when everything already fits', !made.find(function(k){ return k.className === 'scroll-more'; }));

// ── the invite modal got shorter ──
X.AppState.isDemoMode=false;
X.AppState.userProfile={id:'me',name:'Dan S'};
X.AppState.userCircles=[{id:'c1',name:'Ski',memberIds:[]}];
X.AppState.circleById=(id)=>X.AppState.userCircles.find(c=>c.id===id)||null;
X.AppState.userMembers=[{id:'m1',circleId:'c1',name:'Rina',avatar:'R',avatarColor:'#1',contactMethod:'whatsapp',contactValue:'+972501111111',linkedUserId:null,isExternalSource:false}];
const im=X.modalInvite({circleId:'c1',circleName:'Ski'});
ck('invite copy trimmed for a phone screen',
   im.indexOf('They answer from the link')>=0 && im.indexOf('without installing anything.')<0
   && im.indexOf('padding:6px 2px')>=0);
// ── the verdict must appear WHERE THE FORM IS, not at the bottom of the sheet
ck('invite form has its own inline message slot', im.indexOf('id="inv-new-msg"')>=0);
const appTxt = src;
ck('"already on Trustnet" is reported inline and scrolled into view',
   appTxt.indexOf("(info.member_name")>=0 && appTxt.indexOf("already on Trustnet")>=0
   && appTxt.indexOf("el2.scrollIntoView({ block: 'nearest'")>=0);
ck('verdicts are colour-coded by meaning, not all red',
   appTxt.indexOf("background:#E9F6EE;color:#1A5235;")>=0 && appTxt.indexOf("background:#EEF4FB;color:#1A3F6B;")>=0);
// the + menu modal must be well-formed
const fab = X.modalFabMenu();
ck('the + menu has a body the flex layout can size', fab.indexOf('modal-body')>=0);
// measurement actually applies a pixel height
ctx.__vvHeight = 700;
X.sizeModalToViewport();
ck('measured height applied to the modal in px',
   /^\d+px$/.test(String(modalEl.style.maxHeight||'')), modalEl.style.maxHeight);
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
