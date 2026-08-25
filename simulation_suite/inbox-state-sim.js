// inbox-state-sim.js — the inbox must know what has already been dealt with.
//
// TWO FAULTS, measured on production 25 Aug 2026, with one shape.
//
// (1) A request that had been ANSWERED, or that had passed its 72-hour token
//     life, kept a live "Answer" button. Pressing it produced "This link was
//     already used" or "This link has expired". Nothing ever marked the
//     notification done.
//
// (2) An ANSWER showed "+ Save to Library" for ever, even after saving.
//     `query_responses` has exactly one policy, from 0001, and it is
//     `for select`. There is no UPDATE policy, so saveQueries' update matched
//     ZERO ROWS and returned NO ERROR - PostgREST does not fail, the row is
//     simply invisible to it. The client checked r.error, saw none, carried on.
//     Fifteen answers going back to 19 Aug all read saved_to_library = false.
//
//     That is the trap CLAUDE.md already describes: "Assert row outcomes, never
//     the absence of an error." The guard below is written the same way - it
//     asserts what was MARKED, not that nothing complained.
//
//   node inbox-state-sim.js         → web/index.html, must PASS
//   node inbox-state-sim.js --old   → index.pre-v0.76.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.76.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
src += ';globalThis.__x = { AppState, inboxItems, renderInbox, saveQueries };';

const el = () => ({ value:'', textContent:'', style:{}, dataset:{}, innerHTML:'', disabled:false,
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[];},
  querySelector(){return null;}, classList:{add(){},remove(){},toggle(){}}, focus(){}, appendChild(){}, remove(){} });
const byId = {};
let rpcCalls = [];         // { fn, args }
let updateCalls = [];      // { table }
let rpcResult = { data: true, error: null };
let warned = [];           // toast(msg, 'warn')

const ctx = {
  console: { log(){}, error(){}, warn(){}, debug(){} },
  setTimeout: () => 0, clearTimeout(){}, setInterval: () => 1, clearInterval(){},
  requestAnimationFrame: () => 0,
  document: { getElementById: i => (byId[i] = byId[i] || el()), querySelectorAll: () => [],
    querySelector: () => null, createElement: () => el(), addEventListener(){},
    removeEventListener(){}, body: el(), documentElement: el(), head: el(),
    hidden:false, visibilityState:'visible', cookie:'' },
  window: { addEventListener(){}, removeEventListener(){}, supabase:null,
    location:{ href:'x', search:'', hash:'', origin:'x', pathname:'/' },
    matchMedia: () => ({ matches:false, addEventListener(){} }), scrollTo(){} },
  location: { href:'x', search:'', hash:'', origin:'x', pathname:'/' },
  navigator: { userAgent:'sim', language:'en', onLine:true },
  localStorage: { getItem:()=>'0', setItem(){}, removeItem(){}, key:()=>null, length:0 },
  sessionStorage: { getItem:()=>null, setItem(){}, removeItem(){} },
  fetch: async () => ({ ok:true, status:200, json: async () => ({}) }),
  crypto: { randomUUID: () => 'u' + Math.random().toString(16).slice(2),
            subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, TextDecoder, AbortController, URL,
  confirm: () => true, alert(){}, prompt(){},
  atob: s => Buffer.from(s,'base64').toString('binary'),
  btoa: s => Buffer.from(s,'binary').toString('base64'),
  history: { replaceState(){}, pushState(){} },
};
ctx.supabase = { createClient: () => ({
  from: (table) => ({
    // The OLD path went through here and always looked successful.
    update: () => ({ eq: async () => { updateCalls.push({ table }); return { error: null, data: null }; } }),
    upsert: async () => ({ error: null }), insert: async () => ({ error: null }),
    select: () => ({ eq: () => ({ order: async () => ({ data:[], error:null }) }) }),
    delete: () => ({ eq: () => ({ in: async () => ({ error:null }) }) }),
  }),
  auth: { onAuthStateChange(){}, getSession: async () => ({ data:{ session:null } }) },
  rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return rpcResult; },
  channel: () => ({ on(){ return this; }, subscribe(){} }),
})};
ctx.window.supabase = ctx.supabase;
ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  vm.runInContext('renderApp=function(){};showView=function(){};'
    + 'toast=function(m,t){ if(t==="warn") globalThis.__warn.push(m); };'
    + 'globalThis.__warn=[];CURRENT_UID="dan";', ctx);
  const X = ctx.__x;
  const warnList = () => ctx.__warn;

  const HOUR = 3600 * 1000;
  const now = Date.now();

  X.AppState.isDemoMode = false;
  X.AppState.dataLoadFailed = false;
  X.AppState.userMembers = [{ id:'m1', name:'Dany' }];
  X.AppState._notifications = [
    { id:'n-live',    type:'query', title:'Dany is asking their leros circle',
      body:'nice beach in leros', response_token:'tok-live',
      created_at:new Date(now - 2 * HOUR).toISOString(), handled_at:null },
    { id:'n-done',    type:'query', title:'Dany is asking their leros circle',
      body:'recommend me a good read', response_token:'tok-done',
      created_at:new Date(now - 3 * HOUR).toISOString(),
      handled_at:new Date(now - 1 * HOUR).toISOString() },
    { id:'n-lapsed',  type:'query', title:'dan is asking their test circle',
      body:'good gardner', response_token:'tok-old',
      created_at:new Date(now - 96 * HOUR).toISOString(), handled_at:null },
  ];
  X.AppState.userQueries = [{
    id:'q1', text:'best ski resort?', responses: [
      { id:'r-unsaved', contactId:'m1', recName:'Avoriaz 1800',
        respondedAt:new Date(now - 30 * 60 * 1000).toISOString(), savedToLibrary:false },
      { id:'r-saved',   contactId:'m1', recName:'La Plagne',
        respondedAt:new Date(now - 40 * 60 * 1000).toISOString(), savedToLibrary:true },
    ]
  }];

  console.log('\n-- a request that is done says so --\n');
  const items = X.inboxItems();
  const byId2 = (t) => items.find(i => i.title && i.body === t);
  ck('an answered request is marked handled',
     byId2('recommend me a good read') && byId2('recommend me a good read').handled === true);
  ck('a 96-hour-old request is marked lapsed',
     byId2('good gardner') && byId2('good gardner').lapsed === true);
  ck('a 2-hour-old request is neither',
     byId2('nice beach in leros') && !byId2('nice beach in leros').handled
       && !byId2('nice beach in leros').lapsed);

  const html2 = X.renderInbox();
  const answerButtons = (html2.match(/respond\.html\?t=/g) || []).length;
  ck('EXACTLY ONE Answer button is offered - the live request only',
     answerButtons === 1, String(answerButtons));
  ck('...and the answered one says Answered', /Answered/.test(html2));
  ck('...and the lapsed one says it expired', /This request has expired/.test(html2));
  ck('NEG - no Answer link points at the spent token',
     html2.indexOf('respond.html?t=tok-done') < 0);
  ck('NEG - no Answer link points at the lapsed token',
     html2.indexOf('respond.html?t=tok-old') < 0);

  console.log('\n-- an answer already in the library says so --\n');
  ck('an unsaved answer still offers Save to Library',
     /data-action="save-to-library" data-resp-id="r-unsaved"/.test(html2));
  ck('a saved answer does NOT',
     html2.indexOf('data-resp-id="r-saved"') < 0);
  ck('...it says it is in your library instead', /In your library/.test(html2));

  console.log('\n-- marking an answer saved goes through the RPC --\n');
  rpcCalls = []; updateCalls = []; ctx.__warn.length = 0;
  rpcResult = { data: true, error: null };
  await X.saveQueries(['r-unsaved']);
  // Filtered, not indexed: the app fires unrelated RPCs of its own (invite_preview
  // among them) and the first version of this asserted rpcCalls[0], which failed
  // for a reason that had nothing to do with what is being tested.
  const marks = rpcCalls.filter(function(c) { return c.fn === 'mark_response_saved'; });
  ck('saveQueries calls mark_response_saved',
     marks.length === 1, JSON.stringify(rpcCalls.map(function(c) { return c.fn; })));
  ck('...naming the response',
     marks.length === 1 && marks[0].args && marks[0].args.p_response_id === 'r-unsaved',
     JSON.stringify(marks[0] && marks[0].args));
  ck('...and NOT the bare table update that could never work',
     !updateCalls.some(u => u.table === 'query_responses'),
     JSON.stringify(updateCalls));
  ck('a successful mark is silent', warnList().length === 0, JSON.stringify(warnList()));

  console.log('\n-- THE ONE THAT HID FOR SIX DAYS --\n');
  // No error, nothing marked. The old code checked r.error, saw none, and said
  // nothing - which is exactly how fifteen answers stayed unsaved since 19 Aug.
  rpcCalls = []; ctx.__warn.length = 0;
  rpcResult = { data: false, error: null };
  await X.saveQueries(['r-unsaved']);
  ck('marking NOTHING, with no error, is reported to the user',
     warnList().length === 1, JSON.stringify(warnList()));
  ck('...and the message says the mark did not stick',
     warnList().length === 1 && /could not be marked/.test(warnList()[0]),
     JSON.stringify(warnList()));

  console.log('\n-- the badge counts only what is waiting --\n');
  // handled, lapsed and already-saved are all settled; the live request and the
  // unsaved answer are not.
  const waiting = X.inboxItems().filter(i => !i.handled && !i.lapsed && !i.saved).length;
  ck('two of five items are actually waiting', waiting === 2, String(waiting));

  console.log('\n  ' + (useOld ? 'BASELINE v0.75.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
