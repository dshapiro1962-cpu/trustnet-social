// roundtrip-sim.js — DOES THE DATA SURVIVE A SAVE? (v0.46.0)
//
// THE FAILURE THIS SUITE EXISTS FOR:
// v0.45.0 added person_id to saveMembers' field list and NOT to loadUserData's.
// m.personId was therefore always undefined, so every save wrote person_id =
// NULL — for EVERY member, since saveMembers upserts the whole table. One save
// destroyed 14 of 21 person links. resolve_contact then could not return
// 'in_circle' (it needs members.person_id), fell through to 'found_person', the
// user confirmed, and a DUPLICATE was created. "It said he's already here and
// added him anyway."
//
// WHY NO EXISTING TEST CAUGHT IT — the lesson, not the excuse:
// every write test mocked the database with `upsert: async () => ({error:null})`
// — a no-op that ALWAYS SUCCEEDS. They asserted THE CALL WAS MADE, never THE
// DATA SURVIVED. A save that silently destroys a column is indistinguishable
// from a correct one under that mock.
//
// So this suite does not mock persistence. It takes a real row, runs the real
// mapping BOTH WAYS, and asserts nothing was lost. The structural half — one
// field list instead of two — is checked here too, because discipline is not a
// mechanism.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__x={MEMBER_FIELDS,memberFromRow,memberToRow};';
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };
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
vm.runInContext('CURRENT_UID="owner-1";', ctx);
const X = ctx.__x;

// ── STRUCTURAL: one list, so the two directions CANNOT drift ────────────────
ck('there is a single MEMBER_FIELDS list', Array.isArray(X.MEMBER_FIELDS) && X.MEMBER_FIELDS.length > 10);
ck('load is derived from it, not hand-written',
   /AppState\.userMembers = \(ms\.data \|\| \[\]\)\.map\(memberFromRow\);/.test(web));
ck('save is derived from it, not hand-written', /const rows = arr\.map\(memberToRow\);/.test(web));
ck('person_id is in the shared list', X.MEMBER_FIELDS.some(f => f[0] === 'person_id'));

// ── THE ROUND TRIP: a real row in, mapped out, mapped back ──────────────────
const dbRow = {
  id:'m-1', owner_id:'owner-1', circle_id:'c-karate', name:'yoram',
  avatar:'Y', avatar_color:'#217A4B', trust_basis:'karate club',
  contact_method:'email', contact_value:'dshapiro3012@gmail.com',
  response_rate:'unknown', is_external_source:false, source_type:null, source_url:null,
  linked_user_id:'user-9', person_id:'person-42', created_at:'2026-08-06T10:00:00Z'
};
const js = X.memberFromRow(dbRow);
const back = X.memberToRow(js);

ck('THE BUG: person_id survives a load->save round trip', back.person_id === 'person-42',
   'got ' + JSON.stringify(back.person_id));
ck('linked_user_id survives', back.linked_user_id === 'user-9');
ck('circle_id survives', back.circle_id === 'c-karate');
ck('contact_value survives', back.contact_value === 'dshapiro3012@gmail.com');
ck('trust_basis survives', back.trust_basis === 'karate club');
ck('the owner is stamped on save', back.owner_id === 'owner-1');

// EVERY writable column must come back unchanged — not just the ones I thought of.
const lost = [];
X.MEMBER_FIELDS.forEach(function(f) {
  if (f[3] === undefined) return;                  // read-only, never written
  if (dbRow[f[0]] === null || dbRow[f[0]] === undefined) return;
  if (back[f[0]] !== dbRow[f[0]]) lost.push(f[0] + ': ' + JSON.stringify(dbRow[f[0]]) + ' -> ' + JSON.stringify(back[f[0]]));
});
ck('NO writable column is lost or altered by the round trip', lost.length === 0, lost.join(' | '));

// ── a row with nulls must not gain junk, and must not lose its id ───────────
const sparse = { id:'m-2', owner_id:'owner-1', circle_id:'c-1', name:'minimal',
  contact_method:null, contact_value:null, person_id:null, linked_user_id:null,
  is_external_source:false, created_at:'2026-08-06T10:00:00Z' };
const back2 = X.memberToRow(X.memberFromRow(sparse));
ck('a sparse row keeps its id', back2.id === 'm-2');
ck('a null person_id stays null (never invented)', back2.person_id === null);
ck('contact_method falls back consistently', back2.contact_method === 'app');

// ── read-only columns must never be written back ───────────────────────────
ck('created_at is never written back (it is the database\'s)', !('created_at' in back));


// ── THE CLASS, NOT THE INSTANCE ─────────────────────────────────────────────
// dan's question: "are you sure it's fixed, and what did you miss last time?"
// I had fixed saveMembers and stopped. That is fixing the INSTANCE. Below is
// the CLASS, checked mechanically for EVERY save function, so a column added
// to any of them in future trips this instead of nulling production data.
//
// THE PRECISE DANGER — narrower than "written but not read":
// PostgREST upsert only updates the columns you PROVIDE, so omitting one
// leaves it alone. The killer is writing an EXPLICIT value derived from a JS
// field the loader never populates:  person_id: m.personId || null  where
// personId is always undefined  ->  explicit NULL  ->  wiped for every row.
// Safety condition: EVERY column a save writes must be a column the load reads.
const SRC = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
const APPSRC = SRC.slice(0, SRC.indexOf('</script>'));

// THE REAL INVARIANT — corrected after a negative test exposed the first
// version as useless. I first compared DB COLUMN names on both sides. But the
// bug was never about columns: saveMembers wrote  person_id: m.personId || null
// and the LOADER NEVER PRODUCED A KEY CALLED personId. The column name matched
// on both sides in my planted test, so the check passed while the field was
// undefined — writing NULL forever. What must agree is the JS FIELD the save
// READS FROM and the JS KEY the load PRODUCES.
function saveFieldRefs(fnName) {
  const i = APPSRC.indexOf('async function ' + fnName);
  if (i < 0) return null;
  const seg = APPSRC.slice(i, i + 2500);
  const m = seg.match(/\.map\(function\(([a-z])\)\s*\{\s*return \{([\s\S]*?)\};\s*\}\)/);
  if (!m) return null;
  const v = m[1];
  const re = new RegExp('\\b' + v + '\\.([A-Za-z_][A-Za-z0-9_]*)', 'g');
  const out = new Set(); let x;
  while ((x = re.exec(m[2])) !== null) out.add(x[1]);
  return out;
}
function loadProducedKeys(marker) {
  const i = APPSRC.indexOf(marker);
  if (i < 0) return null;
  const seg = APPSRC.slice(i, APPSRC.indexOf('}; });', i));
  return new Set((seg.match(/(^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*:/gm) || [])
    .map(t => t.replace(/[\s,{:]/g, '')));
}

const SAVERS = [
  ['saveRecs',       'AppState.userRecs = '],
  ['saveCircles',    'AppState.userCircles = '],
  ['saveCanonicals', 'AppState.userCanonicals = '],
];
SAVERS.forEach(function (row) {
  const fn = row[0], marker = row[1];
  const uses = saveFieldRefs(fn), made = loadProducedKeys(marker);
  ck(fn + ': its field references were found', !!uses && uses.size > 3, uses ? uses.size + '' : 'NOT FOUND');
  ck(fn + ': its load mapping was found', !!made && made.size > 3, made ? made.size + '' : 'NOT FOUND');
  if (!uses || !made) return;
  const ghosts = [...uses].filter(f => !made.has(f));
  ck(fn + ': every field it saves is a field the loader PRODUCES (the personId class)',
     ghosts.length === 0,
     ghosts.length ? 'ALWAYS UNDEFINED -> writes null: ' + ghosts.join(', ') : '');
});

ck('saveMembers derives both directions from one list (stronger than the scan)',
   /const rows = arr\.map\(memberToRow\);/.test(APPSRC)
   && /\.map\(memberFromRow\)/.test(APPSRC));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
