// addsearch-sim.js — THE ADD-MEMBER SEARCH (v0.63.1).
//
// dan: "I finish typing a name in the add member dialog box and nothing
// happens, only after I tap inside the box again the app reacts."
//
// CAUSE: nm-search carried data-action="search-people", which is routed ONLY by
// the CLICK delegator. Typing fired nothing; tapping the box fired it.
//
// AND EVERY OTHER SYMPTOM HE REPORTED FOLLOWED FROM THAT ONE BINDING:
//   * "I have to scroll down a list of 7 app members to reach her name" — the
//     list was never filtered, so Tchia sat in her alphabetical place. I first
//     called this a SORTING bug and was WRONG: search_my_people already filters
//     with `name ilike '%q%'`, proven against real Postgres (one row: Tchia).
//   * the list overflowed the modal and pushed the footer AND THE TAB BAR off
//     screen — seven cards instead of one.
// One binding, three symptoms, and a fourth (the duplicate button) unrelated.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the binding ─────────────────────────────────────────────────────────────
const src = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
const app = src.slice(0, src.indexOf('</script>'));
const inputBlock = app.slice(app.indexOf("document.addEventListener('input'"),
                             app.indexOf("document.addEventListener('input'") + 3000);
ck('nm-search is routed by the INPUT delegator', /e\.target\.id === 'nm-search'/.test(inputBlock));
ck('...and debounced, so it does not fire per keystroke', /_nmSearchDebounce/.test(inputBlock));
ck('...with a sensible delay', /setTimeout\(refreshPeopleSearch, 180\)/.test(inputBlock));

// ── the duplicate entry point ───────────────────────────────────────────────
ck('"+ Add member" no longer appears in the Invite row', !/\+ Add member/.test(web));
ck('"+ Member" remains at the top right', /data-modal="add-member"[^>]*>\+ Member</.test(web));
ck('...exactly ONE entry point to the dialog',
   (web.match(/data-modal="add-member"/g) || []).length === 1,
   (web.match(/data-modal="add-member"/g) || []).length + ' entry points');

// ── the overflow guards ─────────────────────────────────────────────────────
ck('the results list is height-capped', /id="nm-search-results" style="max-height:min\(46vh,300px\)/.test(web));
ck('...and scrolls inside the modal', /overflow-y:auto/.test(web));
ck('a result card cannot exceed the phone width', /box-sizing:border-box;min-width:0/.test(web));
ck('a long contact wraps rather than stretching', /overflow-wrap:anywhere/.test(web));

// ── behaviour: the input event must actually reach the search ───────────────
let appSrc = app + ';globalThis.__a={refreshPeopleSearch};';
let searched = 0, lastQuery = null;
const el = (id) => ({ id: id || '', value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, click(){}, querySelector:()=>null, querySelectorAll:()=>[] });
const listeners = {};
const ctx = { console:{log(){},error(){},warn(){}},
 setTimeout:(f)=>{ if (typeof f === 'function') f(); return 1; }, clearTimeout(){},
 setInterval:()=>1, clearInterval(){},
 document:{
   getElementById:(id)=> id === 'nm-search' ? Object.assign(el(id), { value: lastQuery || '' }) : el(id),
   createElement:()=>el(), querySelector:()=>null, querySelectorAll:()=>[],
   addEventListener:(ev, fn)=>{ listeners[ev] = fn; }, removeEventListener(){},
   body:el(), documentElement:el(), hidden:false, visibilityState:'visible' },
 window:{addEventListener(){},open(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'}, navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async(n, a)=>{ if (n === 'search_my_people') { searched++; lastQuery = a.p_q; return { data: [] }; } return { data: null }; },
  channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(appSrc, ctx, { filename:'app.js' });

ck('an input listener was registered', typeof listeners.input === 'function');
searched = 0;
if (typeof listeners.input === 'function') {
  // TYPING — the case that did nothing before.
  listeners.input({ target: { id: 'nm-search', value: 'tchia' } });
}
setTimeout(() => {
  ck('BEHAVIOUR: typing triggers the search', searched > 0, searched + ' searches');
  searched = 0;
  if (typeof listeners.input === 'function') {
    listeners.input({ target: { id: 'some-other-field', value: 'x' } });
  }
  setTimeout(() => {
    ck('BEHAVIOUR: a different field does NOT trigger it', searched === 0, searched + ' searches');
    console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  }, 20);
}, 20);
