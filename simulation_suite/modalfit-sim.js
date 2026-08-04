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
const overlayEl=el({className:'modal-overlay'});
overlayEl.querySelector=(sel)=> sel.indexOf('.modal')>=0 ? modalEl : null;
const ctx={console:{log(){},error(){},warn(){}},setTimeout:(f)=>{if(typeof f==='function')f();return 0;},clearTimeout(){},setInterval:()=>1,clearInterval(){},
 document:{getElementById:()=>el(),createElement:(t)=>el({tag:t}),
   querySelector:(sel)=>{ if(sel.indexOf('.modal-body')>=0) return bodyEl; if(sel==='.modal-overlay') return overlayEl; if(sel.indexOf('.modal')>=0) return modalEl; return null; },
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
ck('APP_VERSION is v0.37.0', X.APP_VERSION==='v0.37.0 · live', X.APP_VERSION);

// ── one scroll container, not two ──
ck('the modal itself no longer scrolls (nested scrollers removed)',
   /\.modal \{[^}]*overflow: hidden;[^}]*display: flex; flex-direction: column;/s.test(src));
ck('the BODY is the single scroll area, flexing to fit',
   /\.modal-body \{[^}]*flex: 1 1 auto; min-height: 0; overflow-y: auto;/s.test(src));
ck('header and footer stay put while the body scrolls',
   src.indexOf('.modal-header, .modal-footer { flex: 0 0 auto; }')>=0);

// ── phone sheet ──
// THE BUG: a bottom-anchored sheet anchors to the LAYOUT viewport's bottom,
// which on iOS sits behind Safari's toolbar — so every dialog's lower part was
// hidden. Centred inside a JS-pinned overlay is immune to that.
ck('modals are CENTRED, never bottom-anchored',
   src.indexOf('.modal-overlay { align-items: center; padding: 12px; }')>=0
   && src.indexOf('align-items: flex-end')<0);
ck('no grab handle left over from the sheet design', src.indexOf('.modal::before')<0);
// REGRESSION GUARDS — v0.34.2 broke the app by changing a PAGE-WIDE setting to
// fix a modal. viewport-fit=cover woke up dormant env() padding and doubled the
// tab bar. Never again: modal problems get modal-scoped fixes.
ck('NO page-wide viewport-fit=cover (it doubled the tab bar)',
   src.indexOf('viewport-fit=cover') < 0);
ck('no dvh dependency (needs iOS 15.4+; we measure instead)',
   src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'').indexOf('dvh') < 0);
ck('tab bar cannot be broken by safe-area padding again',
   src.indexOf('box-sizing: border-box;\n    min-height: 62px; height: auto;')>=0
   && src.indexOf('env(safe-area-inset-bottom, 0px)')>=0);
ck('modal height is MEASURED from the visible viewport',
   src.indexOf('window.visualViewport')>=0 && src.indexOf('function sizeModalToViewport')>=0);
ck('headerless modals (the + menu) still get proper top padding',
   src.indexOf('.modal > .modal-body:first-of-type { padding-top: 16px; }')>=0);

ck('phone padding tightened to buy content height',
   src.indexOf('.modal-body { padding: 14px 18px; gap: 12px; }')>=0);
ck('footer respects the phone safe area', src.indexOf('env(safe-area-inset-bottom')>=0);

// ── STACKING (v0.35.1) ───────────────────────────────────────────────────
// THE BUG THAT COST A WEEK: every geometry check above passed while the
// dialog was still broken on dan's iPhone, because the modal was never
// mispositioned — the tab bar (z-index 900) simply PAINTED OVER it (100).
// Geometry tests cannot see paint order. These can.
const zOf = (re) => { const m = src.match(re); return m ? parseInt(m[1],10) : NaN; };
const zOverlay = zOf(/\.modal-overlay \{[^}]*z-index: (\d+)/s);
const zTabbar  = zOf(/#mobile-tabbar \{[^}]*z-index: (\d+)/s);
const zOnb     = zOf(/#onboarding \{[^}]*z-index: (\d+)/s);
const zLoad    = zOf(/#loading-screen \{[^}]*z-index: (\d+)/s);
const zLogin   = zOf(/id="login"[^>]*z-index:(\d+)/);
const zToast   = zOf(/#toast-container \{[^}]*z-index: (\d+)/s);

ck('modal overlay outranks the mobile tab bar (THE iPhone dialog bug)',
   zOverlay > zTabbar, 'overlay '+zOverlay+' vs tabbar '+zTabbar);
ck('the + button cannot float over an open dialog',
   zOverlay > zTabbar);
ck('tab bar does not cover the loading screen', zLoad > zTabbar,
   'loading '+zLoad+' vs tabbar '+zTabbar);
ck('tab bar does not cover onboarding', zOnb > zTabbar,
   'onboarding '+zOnb+' vs tabbar '+zTabbar);
ck('tab bar does not cover the login screen', zLogin > zTabbar,
   'login '+zLogin+' vs tabbar '+zTabbar);
ck('toasts stay visible above an open modal', zToast > zOverlay);
ck('no two full-screen layers share a z-index (DOM order must never decide)',
   new Set([zOverlay,zOnb,zLoad,zLogin,zToast]).size === 5,
   [zOverlay,zOnb,zLoad,zLogin,zToast].join(','));
ck('the layer scale is documented in the source',
   src.indexOf('LAYER SCALE')>=0);
ck('no NaN in the layer inventory (a rule was renamed or deleted)',
   [zOverlay,zTabbar,zOnb,zLoad,zLogin,zToast].every(n=>!isNaN(n)));


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
ck('overlay is PINNED to the visible viewport (top + height in px)',
   overlayEl.style.height==='700px' && overlayEl.style.top==='0px' && overlayEl.style.bottom==='auto');
ck('modal fits inside it with room to spare',
   modalEl.style.maxHeight==='676px', modalEl.style.maxHeight);
// iOS slides the visual viewport: offsetTop must be honoured
ctx.window.visualViewport={height:560,offsetTop:90,addEventListener(){}};
X.sizeModalToViewport();
ck('when iOS slides the viewport, the overlay follows it',
   overlayEl.style.top==='90px' && overlayEl.style.height==='560px' && modalEl.style.maxHeight==='536px');
// no visualViewport (old browsers) must still work
ctx.window.visualViewport=undefined; ctx.window.innerHeight=800;
X.sizeModalToViewport();
ck('falls back to innerHeight when visualViewport is unavailable',
   overlayEl.style.height==='800px' && modalEl.style.maxHeight==='776px');
ck('viewport SCROLL is tracked, not just resize', src.indexOf("visualViewport.addEventListener('scroll', reflow)")>=0);
console.log('\nRESULT: '+pass+' passed, '+fail+' failed'); process.exit(fail?1:0);
