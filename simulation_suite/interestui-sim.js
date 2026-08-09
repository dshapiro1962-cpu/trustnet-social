// interestui-sim.js — STAGE 1: what is this circle about? (v0.49.0)
//
// The owner's answer is the TRUTH. The 50%/3-item thresholds decide only
// whether it is worth ASKING — dan had no view on the numbers, so they were
// made not to matter: a manual "set what this circle is about" always exists,
// and a wrong threshold costs a missed prompt rather than a wrong outcome.
//
// Silence is the safe default: no CONFIRMED interest means the circle neither
// receives suggestions nor contributes any. 'declined' is stored separately so
// a circle the owner silenced is distinguishable from one never asked.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── static ──────────────────────────────────────────────────────────────────
ck('canonicals.kind is loaded into the client', /kind:c\.kind\|\|''/.test(web));
ck('circle_interests is loaded', /from\('circle_interests'\)\.select/.test(web));
ck('only CONFIRMED interests are matched', /r\.source === 'confirmed'/.test(web));
ck('declined is stored, not inferred', /r\.source === 'declined'/.test(web));
ck('the manual path always exists', /Set what this circle is about/.test(web));
ck('a save failure is surfaced, never swallowed', /Could not save that: /.test(web));

let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={interestsForKind,circleInterestGuess,circleInterestCardHtml,circleInterestsFor,AppState};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, querySelector:()=>null, querySelectorAll:()=>[] });
const ctx = { console:{log(){},error(){},warn(){}}, setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){}, setInterval:()=>1, clearInterval(){},
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,querySelectorAll:()=>[],
   addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x'}, navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({from:()=>({}),auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:null}),channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext('CURRENT_UID="me";', ctx);
const X = ctx.__x;
X.AppState.isDemoMode = false;
X.AppState.circleInterests = [];
X.AppState.userCircles = [{ id:'c-read', name:'Reading', domain:'culture' }];

// dan's example: a reading circle that is mostly books
const cans = [
  { id:'k1', name:'The White Tiger', kind:'novel' },
  { id:'k2', name:'Lethal White', kind:'novel' },
  { id:'k3', name:"The Christmas Pig", kind:"children's book" },
  { id:'k4', name:'Leros', kind:'island' },
];
X.AppState.userCanonicals = cans;
X.AppState.userRecs = [
  { id:'r1', canonicalId:'k1', circleId:'c-read' },
  { id:'r2', canonicalId:'k2', circleId:'c-read' },
  { id:'r3', canonicalId:'k3', circleId:'c-read' },
  { id:'r4', canonicalId:'k4', circleId:'c-read' },
];

// ── THE CLIENT MIRROR MUST NOT DRIFT FROM THE SERVER ───────────────────────
// interestsForKind exists TWICE: in _shared/enrich_core.ts (authoritative) and
// mirrored here so the confirm card can count without a round trip. Two copies
// of one rule is exactly what produced the classify-rec and match_canonical
// bugs, so both the TRAPS and the AGREEMENT are checked.
const cf = X.interestsForKind;
ck('CLIENT TRAP: "skin doctor" is NOT ski', !cf('skin doctor').includes('ski'), cf('skin doctor').join(','));
ck('CLIENT TRAP: "barber" is NOT a bar', !cf('barber').includes('bar'), cf('barber').join(','));
ck('CLIENT TRAP: "bookkeeper" is NOT a book', !cf('bookkeeper').includes('book'), cf('bookkeeper').join(','));
ck('CLIENT: "novel" -> book', cf('novel').includes('book'));
ck('CLIENT: "ski resort" -> ski and destination',
   cf('ski resort').includes('ski') && cf('ski resort').includes('destination'));
ck('CLIENT: unknown kind matches nothing', cf('quantum flux capacitor').length === 0);

const serverSrc = fs.readFileSync('/home/claude/fx-out/supabase/functions/_shared/enrich_core.ts', 'utf8');
// Index-based extraction, not a regex: a pattern that silently fails to match
// makes this check pass vacuously, which is worse than no check at all.
const slice = (src, from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  return (a >= 0 && b > a) ? src.slice(a, b) : '';
};
const clientTerms = slice(web, 'const INTEREST_MAP = [', 'const INTEREST_ALSO');
const serverTerms = slice(serverSrc, 'const KIND_MAP', 'const ALSO');
// The server file uses DOUBLE quotes and the client SINGLE — match both, or
// the comparison silently sees zero server terms and passes vacuously.
const words = (t) => new Set((t.match(/'[^']+'|"[^"]+"/g) || []).map(x => x.slice(1, -1)));
const cw = words(clientTerms), sw = words(serverTerms);
const onlyClient = [...cw].filter(x => !sw.has(x));
const onlyServer = [...sw].filter(x => !cw.has(x));
ck('both vocabularies were actually found', cw.size > 40 && sw.size > 40,
   'client=' + cw.size + ' server=' + sw.size);
ck('the client mirror and the server vocabulary are IDENTICAL',
   onlyClient.length === 0 && onlyServer.length === 0,
   'client-only: ' + onlyClient.join(',') + ' | server-only: ' + onlyServer.join(','));

const g = X.circleInterestGuess('c-read');
ck('BEHAVIOUR: counts only items with a usable kind', g.known === 4, 'known=' + g.known);
ck('BEHAVIOUR: books are the dominant interest', g.top === 'book' && g.topN === 3,
   g.top + '=' + g.topN);
const html = X.circleInterestCardHtml('c-read');
ck('the card ASKS rather than assuming', /Is this circle about books\?/.test(html));
ck('...and shows the evidence it counted', /3 of the 4 things here are books/.test(html));
ck('...and explains the consequence of saying yes', /send you books they find/.test(html));
ck('...and offers Not now', /data-action="decline-interest"/.test(html));

// too thin to ask about
X.AppState.userRecs = [{ id:'r1', canonicalId:'k1', circleId:'c-read' }];
ck('a 1-item circle is NOT nagged', !/Is this circle about/.test(X.circleInterestCardHtml('c-read')));
ck('...but the manual option is still offered',
   /Set what this circle is about/.test(X.circleInterestCardHtml('c-read')));

// mixed circle, no dominant kind
X.AppState.userCanonicals = cans.concat([{ id:'k5', name:'Basta', kind:'restaurant' },
                                         { id:'k6', name:'Wong', kind:'restaurant' }]);
X.AppState.userRecs = [
  { id:'r1', canonicalId:'k1', circleId:'c-read' }, { id:'r4', canonicalId:'k4', circleId:'c-read' },
  { id:'r5', canonicalId:'k5', circleId:'c-read' }, { id:'r6', canonicalId:'k6', circleId:'c-read' },
];
ck('a circle with no dominant kind is NOT asked',
   !/Is this circle about/.test(X.circleInterestCardHtml('c-read')));

// once confirmed, it shows the answer and stops asking
X.AppState.circleInterests = [{ circle_id:'c-read', interest:'book', source:'confirmed' }];
const done = X.circleInterestCardHtml('c-read');
ck('a confirmed circle shows its interest', /THIS CIRCLE IS ABOUT/.test(done) && /books/.test(done));
ck('...and never asks again', !/Is this circle about/.test(done));
ck('...and can still be changed', /data-action="edit-interests"/.test(done));

// declined stays declined
X.AppState.circleInterests = [{ circle_id:'c-read', interest:'_none', source:'declined' }];
const dec = X.circleInterestCardHtml('c-read');
ck('a declined circle is not nagged again', !/Is this circle about/.test(dec));
ck('...and says it is not used for suggestions', /Not used for suggestions/.test(dec));
ck('declined interests never count as confirmed', X.circleInterestsFor('c-read').length === 0);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
