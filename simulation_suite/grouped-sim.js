// grouped-sim.js — ONE CARD PER PLACE (v0.38.0).
//
// dan's case, verbatim: Silverton answered three questions from three circles
// ("similar to La Grave in the USA", "most extreme freeride resort in the USA",
// "a resort with no groomed or marked runs"). Typing "Silverton" must show ONE
// card carrying all three reasons — not three duplicate cards, and not one
// reason chosen by whichever row happened to be tapped.
const vm = require('vm'); const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── static ──────────────────────────────────────────────────────────────────
ck('client carries created_at (rec_date ties on import days)',
   /createdAt:r\.created_at/.test(web));
ck('detail view uses allRecsForCanon (was computed and ignored since v0.17)',
   /qEntries = allRecsForCanon/.test(web));

let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={libFilterRecs,libGroupByCanonical,libCountLabel,'
     + 'libCircleLabelHtml,libQuestionLineHtml,libResultsHtml,AppState};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){}, appendChild(){}, remove(){}, focus(){},
  querySelector:()=>null, querySelectorAll:()=>[] });
const ctx = { console:{log(){},error(){},warn(){}},
  setTimeout:(f)=>{if(typeof f==='function')f();return 0;}, clearTimeout(){},
  setInterval:()=>1, clearInterval(){},
  document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,
    querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},
    body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
  window:{addEventListener(){},innerWidth:390,innerHeight:664,
    visualViewport:{height:664,offsetTop:0,addEventListener(){}},
    location:{href:'x',search:'',hash:'',origin:'x'},
    matchMedia:()=>({matches:false,addEventListener(){}})},
  location:{href:'x',search:'',hash:'',origin:'x'},
  navigator:{userAgent:'sim',language:'en'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  fetch:async()=>({ok:true,json:async()=>({})}),
  crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
  URLSearchParams, TextEncoder, AbortController,
  confirm:()=>true, alert(){}, prompt(){}, history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:[]}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext('renderApp=function(){};showView=function(){};toast=function(){};CURRENT_UID="me";fnPost=function(){return Promise.resolve({});};', ctx);
const X = ctx.__x;
X.AppState.isDemoMode = false;
X.AppState.activeFilter = 'all';
X.AppState.activeCatFilter = 'all';
X.AppState.userProfile = { id:'me', name:'Dan' };
X.AppState.userCanonicals = [
  { id:'cSilv', name:'Silverton Mountain', location:'Colorado', primaryCategory:'travel', hasSearchDoc:true },
  { id:'cK2',   name:'K2 Sender',          location:'',         primaryCategory:'hobbies', hasSearchDoc:true },
];
X.AppState.userCircles = [
  { id:'ski',    name:'ski' },
  { id:'travel', name:'travel' },
  { id:'gear',   name:'gear' },
];
X.AppState.userQueries = [
  { id:'q1', text:'similar place to la grave in the USA',        circleId:'ski' },
  { id:'q2', text:'most extreme freeride ski resort in the USA', circleId:'travel' },
  { id:'q3', text:'a whole resort with no groomed and marked runs', circleId:'gear' },
  { id:'q4', text:'best freeride skis',                          circleId:'ski' },
];
X.AppState.userMembers = [{ id:'m1', name:'Rina' }, { id:'m2', name:'Yossi' }];
X.AppState.userRecs = [
  { id:'rA', canonicalId:'cSilv', circleId:'ski',    queryId:'q1', note:'like La Grave but smaller', createdAt:'2026-07-01T10:00:00Z', status:'saved', recommendedBy:'m1' },
  { id:'rB', canonicalId:'cSilv', circleId:'travel', queryId:'q2', note:'no beginners at all',       createdAt:'2026-07-20T10:00:00Z', status:'saved', recommendedBy:'m2' },
  { id:'rC', canonicalId:'cSilv', circleId:'gear',   queryId:'q3', note:'zero grooming, guides only', createdAt:'2026-07-10T10:00:00Z', status:'saved', recommendedBy:'m1' },
  { id:'rD', canonicalId:'cK2',   circleId:'ski',    queryId:'q4', note:'stiff, great edge hold',     createdAt:'2026-07-05T10:00:00Z', status:'saved', recommendedBy:'m2' },
];

// ── 1. no search: one card per place ────────────────────────────────────────
X.AppState.searchQuery = ''; X.AppState._semantic = null;
let f = X.libFilterRecs(); let g = X.libGroupByCanonical(f);
ck('4 recommendations collapse to 2 cards', g.length === 2, g.length + ' cards');
const silv = g.find(x => x.key === 'cSilv');
ck('Silverton appears exactly once', !!silv && silv.all.length === 3);
ck('lead is the MOST RECENT take when nothing is ranked', silv.lead.id === 'rB', silv.lead.id);
ck('circle label follows the most recent take', silv.circleName === 'travel', silv.circleName);
ck('label shows the other two circles as +2', silv.otherCircles === 2, '+' + silv.otherCircles);
ck('label renders "travel +2"', X.libCircleLabelHtml(silv).indexOf('travel +2') > 0,
   X.libCircleLabelHtml(silv));
ck('counts three distinct questions', silv.questionIds.length === 3);
ck('offers "answered 2 more questions"', silv.otherQuestions === 2);
ck('question line shows the LEAD question + the more-line',
   X.libQuestionLineHtml(silv).indexOf('extreme freeride') > 0
   && X.libQuestionLineHtml(silv).indexOf('answered 2 more questions') > 0,
   X.libQuestionLineHtml(silv));
ck('single-circle item shows a bare label, no +N',
   X.libCircleLabelHtml(g.find(x => x.key === 'cK2')).indexOf('+') < 0);

// ── 2. count reports CARDS, and admits the difference ───────────────────────
f.groups = g;
ck('count says items, not rows', X.libCountLabel(f).indexOf('2 items') === 0, X.libCountLabel(f));
ck('count discloses the 4 underlying recommendations (no phantom data loss)',
   X.libCountLabel(f).indexOf('4 recommendations') > 0, X.libCountLabel(f));

// ── 3. reranked: the lead is the question that MATCHED ──────────────────────
X.AppState.searchQuery = 'no groomed runs';
X.AppState._semantic = { q:'no groomed runs', ids:['rC','rA','rB'], why:{}, reranked:true };
f = X.libFilterRecs(); g = X.libGroupByCanonical(f);
const silv2 = g.find(x => x.key === 'cSilv');
ck('still ONE Silverton card under search', g.length === 1 && silv2.all.length === 3);
ck('lead is the top-RANKED take, not the newest', silv2.lead.id === 'rC', silv2.lead.id);
ck('the matching question is the one shown',
   X.libQuestionLineHtml(silv2).indexOf('no groomed and marked runs') > 0);
ck('circle label STILL follows recency, not the match', silv2.circleName === 'travel');

// ── 4. circle filter: the card survives, the +N is honest ───────────────────
X.AppState.searchQuery = ''; X.AppState._semantic = null;
X.AppState.activeFilter = 'ski';
f = X.libFilterRecs(); g = X.libGroupByCanonical(f);
const silv3 = g.find(x => x.key === 'cSilv');
ck('filtering to ski still shows Silverton once', !!silv3 && silv3.all.length === 1);
ck('filtered card reports only the visible circle (no phantom +N)',
   silv3.circleName === 'ski' && silv3.otherCircles === 0,
   silv3.circleName + ' +' + silv3.otherCircles);

// ── 5. the rendered list really is one card per place ───────────────────────
X.AppState.activeFilter = 'all';
f = X.libFilterRecs(); f.groups = X.libGroupByCanonical(f);
const html = X.libResultsHtml(f);
ck('rendered HTML contains ONE Silverton card',
   (html.match(/Silverton Mountain/g) || []).length === 1,
   (html.match(/Silverton Mountain/g) || []).length + ' occurrences');
ck('rendered HTML carries the circle tag', html.indexOf('rec-circle-tag') > 0);
ck('rendered HTML carries the more-questions line', html.indexOf('rec-qmore') > 0);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
