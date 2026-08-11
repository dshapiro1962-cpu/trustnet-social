// The watermark rule, extracted from the shipping source and executed.
// THE BUG IT ENCODES: the sweep set last_at = now() on EVERY run, including
// runs that created nothing. Each run therefore consumed its own window and
// erased the evidence — five separate diagnoses chased a target the code kept
// resetting, and dan rightly asked whether I knew what I was doing.
const fs = require('fs');
const src = fs.readFileSync('/home/claude/fx-out/supabase/functions/suggest-sweep/index.ts','utf8');
let pass=0, fail=0;
const ck=(n,c,x)=>{ if(c){pass++;console.log('  ok  ',n);}else{fail++;console.log('  FAIL',n,x||'');} };

// the rule, as shipped
const rule = (contributions, insertFailed, dryRun) => {
  const seenUpTo = contributions.map(c=>c.at).filter(Boolean).sort().pop() ?? null;
  if (!contributions.length) return { moved:false, to:null };
  if (seenUpTo && insertFailed===0 && !dryRun) return { moved:true, to:seenUpTo };
  return { moved:false, to:null };
};

const A = { at:'2026-08-01T10:00:00Z' }, B = { at:'2026-08-10T14:18:39Z' };

ck('an empty run does NOT move the watermark', rule([],0,false).moved === false);
ck('a normal run moves it to the NEWEST thing it SAW, not to now()',
   rule([A,B],0,false).to === '2026-08-10T14:18:39Z');
ck('...not to the oldest', rule([A,B],0,false).to !== '2026-08-01T10:00:00Z');
ck('an insert failure leaves the watermark ALONE so the next run retries',
   rule([A,B],1,false).moved === false);
ck('a DRY RUN never moves it', rule([A,B],0,true).moved === false);
ck('a run that saw items but has none timestamped does not move it',
   rule([{at:null}],0,false).moved === false);

// and the source must actually contain these properties
ck('SOURCE: the empty-run early return does not update sweep_state',
   /nothing to record[\s\S]{0,200}return json\(\{ engine: ENGINE, scanned: 0, created: 0, watermark_moved: false \}\)/.test(src));
ck('SOURCE: the watermark is set from the data, never from `started`',
   /update\(\{ last_at: seenUpTo \}\)/.test(src) && !/update\(\{ last_at: started \}\)/.test(src));
ck('SOURCE: contributions are ordered oldest-first so a page is contiguous',
   /\.order\("created_at", \{ ascending: true \}\)/.test(src));
ck('SOURCE: answers are ordered too', /\.order\("responded_at", \{ ascending: true \}\)/.test(src));
ck('SOURCE: dry run writes nothing', /if \(dryRun\) \{ created\+\+; continue; \}/.test(src));
ck('SOURCE: the response reports whether the watermark moved',
   /watermark_moved: watermarkMoved/.test(src));


// ── NO QUERY MAY SWALLOW ITS ERROR (v0.56.0) ────────────────────────────────
// THE BUG: `const { data: recs } = await admin.from("recommendations")...` — the
// error was never bound. The query failed, recs came back null, and the sweep
// reported scanned:68 which was EXACTLY the answers count. 46 recommendations,
// including dan's Jackson Hole, never entered the array. Five diagnoses
// examined the wrong half of the data, because a FAILED query and an EMPTY one
// look identical.
// FIFTH occurrence of this pattern in this project: the identity lookup whose
// crash read as "not a user"; the recheck reporting a crash as "no account";
// the mocked upsert that made data loss look like success; the sweep's
// `if (!error) created++`; and this. It is now checked mechanically.
const unchecked = (src.match(/const \{ data: \w+ \} = await/g) || []);
ck('every query binds its error (none swallowed)', unchecked.length === 0,
   unchecked.length ? unchecked.join(' | ') : '');
const bound = (src.match(/const \{ data: \w+, error: \w+ \} = await/g) || []).length;
ck('...and there are several such queries, so the check is meaningful', bound >= 6, bound + ' bound');
ck('a failed SOURCE query aborts the run rather than contributing nothing',
   /if \(recsErr \|\| ansErr\) \{[\s\S]{0,200}source_query_failed/.test(src));
ck('the response reports the split, so a missing half is visible at a glance',
   /from_saves: \(recs \?\? \[\]\)\.length, from_answers: \(answers \?\? \[\]\)\.length/.test(src));
ck('a failed library check is NOT read as "they already have it"',
   /if \(hasErr\) \{[\s\S]{0,160}library_check:/.test(src));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
