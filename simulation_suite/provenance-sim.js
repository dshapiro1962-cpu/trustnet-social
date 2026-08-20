// provenance-sim.js — TWO COLUMNS MUST NOT BECOME ONE FIELD (v0.65.0)
//
// dany could not save ANYTHING. Meribel and Champoluc never reached the
// database, "send to a member" said "the item is not yours to send", library
// search found nothing, and shapiro never received either item. ONE ROW caused
// all of it.
//
// THE ROUND TRIP THAT BROKE:
//   accept a suggestion -> recommended_by_user_id = dan's USER id   (correct)
//   loadUserData        -> recommendedBy = member_id || user_id     (FOLDED)
//   saveRecs            -> recommendedBy !== CURRENT_UID ? into recommended_by_
//                          MEMBER_id : null                          (GUESSED)
// dan's user id is not dany's, so it went into a FOREIGN KEY TO MEMBERS.
// Postgres: 23503, "Key is not present in table members". And because saveRecs
// upserts the WHOLE ARRAY, that one row blocked every save dany ever made.
//
// roundtrip-sim could not catch this: it checks that every field a save WRITES
// is a key the loader PRODUCES. Here the field existed on both sides — the
// asymmetry was TWO COLUMNS FOLDED INTO ONE, which no field-list comparison
// can see.
const vm = require('vm'), fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

ck('the loader keeps the member column in its OWN field',
   /recommendedByMember: r\.recommended_by_member_id \|\| null/.test(web));
ck('...and the user column in its own', /recommendedByUser: r\.recommended_by_user_id \|\| null/.test(web));
ck('the saver no longer GUESSES by comparing to CURRENT_UID',
   !/recommended_by_member_id:\(r\.recommendedBy && r\.recommendedBy!==CURRENT_UID\)/.test(web));
ck('the member id is VALIDATED against members we hold',
   /\(AppState\.userMembers \|\| \[\]\)\.some\(function\(m\)\{ return m\.id === mid; \}\)/.test(web));
ck('saveRecs THROWS instead of returning quietly',
   /throw new Error\('saveRecs failed: '/.test(web));
ck('...and every caller is guarded so none announces success over a failure',
   (web.match(/try \{ await saveRecs\(\); \} catch \(e\) \{ return; \}/g) || []).length >= 10,
   (web.match(/try \{ await saveRecs\(\); \} catch \(e\) \{ return; \}/g) || []).length + ' guarded');
ck('an account already stuck heals ON LOAD, with no console command',
   /SELF-HEALING/.test(web));

// ── BEHAVIOUR: run the real save mapping on dany's exact row ───────────────
let app = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
app = app.slice(0, app.indexOf('</script>'));
app += ';globalThis.__s={saveRecs,AppState};';
const el = () => ({ value:'', style:{}, dataset:{}, textContent:'', innerHTML:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false;}}, addEventListener(){},
  appendChild(){}, remove(){}, focus(){}, click(){}, querySelector:()=>null, querySelectorAll:()=>[] });
let upserted = null;
const ctx = { console:{log(){},error(){},warn(){}}, setTimeout:(f)=>{if(typeof f==='function')f();return 0;},
 clearTimeout(){}, setInterval:()=>1, clearInterval(){},
 document:{getElementById:()=>el(),createElement:()=>el(),querySelector:()=>null,querySelectorAll:()=>[],
   addEventListener(){},removeEventListener(){},body:el(),documentElement:el(),hidden:false,visibilityState:'visible'},
 window:{addEventListener(){},open(){},innerWidth:390,innerHeight:664,
   visualViewport:{height:664,offsetTop:0,addEventListener(){}},
   location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'},matchMedia:()=>({matches:false,addEventListener(){}})},
 location:{href:'x',search:'',hash:'',origin:'x',pathname:'/'}, navigator:{userAgent:'sim',language:'en'},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 fetch:async()=>({ok:true,json:async()=>({})}), crypto:{randomUUID:()=>'u',subtle:{digest:async()=>new ArrayBuffer(32)}},
 URLSearchParams, TextEncoder, AbortController, confirm:()=>true, alert(){}, prompt(){},
 history:{replaceState(){},pushState(){}} };
ctx.supabase={createClient:()=>({
  from:()=>({ upsert:(rows)=>{ upserted = rows; return Promise.resolve({error:null}); },
              delete:()=>({ eq:()=>({ not:async()=>({error:null}) }) }),
              select:()=>({ eq:()=>({ order:async()=>({data:[]}) }) }) }),
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},
  rpc:async()=>({data:null}), channel:()=>({})})};
ctx.window.supabase=ctx.supabase; ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(app, ctx, { filename:'app.js' });
vm.runInContext("CURRENT_UID='dany-uid';", ctx);
const S = ctx.__s;

(async () => {
  // DANY'S EXACT ROW: accepted from dan, so the provenance is dan's USER id.
  S.AppState.userMembers = [{ id: 'real-member-1' }];
  S.AppState.userRecs = [{
    id: 'c543779c', canonicalId: 'f6c3dfa6',
    recommendedByUser: 'dan-uid', recommendedByMember: null,
    recommendedBy: 'dan-uid',       // what the OLD loader produced
    note: 'La Plagne offers a fantastic ski holiday experience.',
  }];
  await S.saveRecs();
  const row = upserted && upserted[0];
  ck('BEHAVIOUR: another user\'s provenance NEVER reaches the members foreign key',
     !!row && row.recommended_by_member_id === null,
     row ? JSON.stringify({m: row.recommended_by_member_id, u: row.recommended_by_user_id}) : 'no upsert');
  ck('BEHAVIOUR: ...it goes to the USER column, where it belongs',
     !!row && row.recommended_by_user_id === 'dan-uid');

  // a genuine member recommendation still round-trips
  upserted = null;
  S.AppState.userRecs = [{ id: 'r2', canonicalId: 'c2',
    recommendedByMember: 'real-member-1', recommendedByUser: null, recommendedBy: 'real-member-1' }];
  await S.saveRecs();
  ck('BEHAVIOUR: a real member recommendation is preserved',
     upserted && upserted[0].recommended_by_member_id === 'real-member-1');

  // a DELETED member must not poison the save
  upserted = null;
  S.AppState.userRecs = [{ id: 'r3', canonicalId: 'c3',
    recommendedByMember: 'deleted-member-9', recommendedByUser: null, recommendedBy: 'deleted-member-9' }];
  await S.saveRecs();
  ck('BEHAVIOUR: a DELETED member is dropped, not written as a dangling key',
     upserted && upserted[0].recommended_by_member_id === null,
     upserted ? String(upserted[0].recommended_by_member_id) : 'no upsert');

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
})();
