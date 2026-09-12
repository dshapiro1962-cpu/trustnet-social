// inbox-save-live-sim.js — the INBOX save, executed against the REAL database
// as a REAL non-superuser with RLS ON, inside a transaction that is always
// rolled back.
//
// WHY THIS EXISTS. inbox-save-sim.js runs the real client functions but mocks
// every write: saveRecs, saveCanonicals and saveQueries are stubs that record
// their arguments. That proves the payload is assembled correctly and proves
// nothing at all about whether the database accepts it. Two of the worst bugs
// in this repo lived exactly there:
//
//   1. query_responses has ONE policy, `for select` (0001). The old
//      `.update({saved_to_library:true})` matched ZERO ROWS and returned NO
//      ERROR. The flag never once stuck — fifteen answers back to 19 Aug all
//      read false — and every guard passed, because they read r.error.
//      0046 replaced it with the security-definer RPC this sim calls.
//   2. The chat-import save threw on a live row shape no source check modelled
//      (see save-path-live-sim.js).
//
// So this asserts ROW OUTCOMES read back out of the database: what
// source_question actually contains, what mark_response_saved actually
// returned. Never the absence of an error.
//
// IT RUNS AS `authenticated`, NOT AS postgres. The connection is the owner, so
// the first section switches role and sets request.jwt.claims, then PROVES the
// switch took by requiring a foreign-owner insert to be refused. If that
// insert succeeds, RLS is off, the sim is measuring nothing, and it stops.
//
// NOTHING IS KEPT. The rollback is in `finally` and the counts are asserted
// afterwards.
//
//   node inbox-save-live-sim.js         → must PASS
//   node inbox-save-live-sim.js --old   → writes the row the way a FAKED
//                                         queryState would (no question, no
//                                         query link) and must FAIL
//
// Needs .env.local for TRUSTNET_DB_URL; skips cleanly without it.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));

const useOld = process.argv.indexOf('--old') > -1;
const envPath = path.join(REPO, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('no .env.local — this sim needs TRUSTNET_DB_URL. Skipping.');
  process.exit(2);
}
const m0 = fs.readFileSync(envPath, 'utf8').match(/TRUSTNET_DB_URL\s*=\s*(.+)/);
if (!m0) { console.error('TRUSTNET_DB_URL not found in .env.local'); process.exit(2); }
const url = m0[1].trim();

const UID = 'c7af8222-f595-455b-83d4-d848a8bd621a';   // dan
const STRAY = 'zz-inbox-save-live-sim-canonical';      // findable if it ever leaks

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  const before = (await c.query(
    'select count(*)::int n from recommendations where owner_id=$1', [UID])).rows[0].n;
  const canBefore = (await c.query('select count(*)::int n from canonicals')).rows[0].n;

  // dan's real ask, 12 Sep: a travel circle, a question in Hebrew with a Latin
  // place name in the middle of it, and the answers he could not keep.
  const q = (await c.query(
    `select id, circle_id, text from queries
      where text ilike '%Apulia%' order by sent_at desc nulls last limit 1`)).rows[0];
  if (!q) { console.error('the Apulia query is not in this database'); process.exit(2); }

  const resp = (await c.query(
    `select id, member_id, rec_name, rec_note, rec_location, rec_emoji, canonical_id,
            saved_to_library, is_anonymous
       from query_responses
      where query_id=$1 and responded_at is not null
      order by responded_at limit 1`, [q.id])).rows[0];
  if (!resp) { console.error('that query has no answered response'); process.exit(2); }

  console.log('\n-- the real rows this is about --\n');
  console.log('   query    ' + q.id);
  console.log('   question ' + q.text);
  console.log('   circle   ' + q.circle_id);
  console.log('   answer   ' + resp.id + '  "' + String(resp.rec_name).slice(0, 40) + '"');
  console.log('   marked   saved_to_library=' + resp.saved_to_library);

  await c.query('begin');
  try {
    // The Inbox offers the button whenever the flag is false. If this row has
    // since been marked, put it back inside the transaction so the RPC has
    // something to do — the rollback undoes it either way.
    if (resp.saved_to_library) {
      await c.query('update query_responses set saved_to_library=false where id=$1', [resp.id]);
    }

    // ── HARNESS CONTROL ──────────────────────────────────────────────────
    // Everything below is worthless if this section does not hold.
    console.log('\n== HARNESS CONTROL: is this actually RLS, as a real user? ==\n');

    await c.query('set local role authenticated');
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
      [UID]);

    const who = (await c.query(
      "select current_user cu, auth.uid() uid, auth.role() role, "
      + "(select rolbypassrls from pg_roles where rolname=current_user) bypass")).rows[0];
    ck('running as authenticated, not as the owner', who.cu === 'authenticated', 'current_user=' + who.cu);
    ck('that role cannot bypass RLS', who.bypass === false, 'rolbypassrls=' + who.bypass);
    ck('auth.uid() resolves to dan', who.uid === UID, 'uid=' + who.uid);
    ck('auth.role() is authenticated — canonicals_insert checks it', who.role === 'authenticated');

    let refused = false;
    try {
      await c.query('savepoint foreign_owner');
      await c.query(
        `insert into recommendations (owner_id,canonical_id,note,status,degree,rec_date)
         values ($1,$2,'rls probe','saved',1,current_date)`,
        ['00000000-0000-0000-0000-000000000001', resp.canonical_id]);
      await c.query('rollback to savepoint foreign_owner');
    } catch (e) {
      refused = true;
      await c.query('rollback to savepoint foreign_owner');
    }
    ck('writing a row owned by SOMEONE ELSE is refused — the policy is live', refused,
       'the insert SUCCEEDED: RLS is not in force and nothing below is evidence');
    if (!refused) {
      console.log('\n  STOPPING: the environment is not faithful.\n');
      throw new Error('harness control failed');
    }

    // ── THE SAVE, exactly as handleConfirmSaveToLibrary assembles it ──────
    console.log('\n== the save, from the Inbox, with no query on screen ==\n');

    // What the fix derives from respId alone. The control takes the other
    // route: a faked queryState, which knows the response but not its question.
    const ctxQuery = useOld
      ? { id: null, circle_id: null, text: '' }     // what faking it produces
      : { id: q.id, circle_id: q.circle_id, text: q.text };

    const can = await c.query(
      `insert into canonicals (type,name,category,location,image_emoji,created_by,
         primary_category,class_source,classified_at,search_doc,search_doc_at)
       values ('place',$1,$2,$3,$4,$5,'other','ai',now(),$6,now())
       returning id`,
      [STRAY, 'hotel', resp.rec_location || 'Apulia', resp.rec_emoji || '🏨', UID,
       STRAY + ' ' + (resp.rec_note || '')]);
    ck('the canonical inserts under canonicals_insert', !!can.rows[0].id);
    const canId = can.rows[0].id;

    const rec = await c.query(
      `insert into recommendations (owner_id,canonical_id,circle_id,query_id,source_question,
         recommended_by_member_id,note,rating,status,is_anonymous,degree,shared_to_network,rec_date)
       values ($1,$2,$3,$4,$5,$6,$7,5,'saved',$8,1,false,current_date)
       returning id`,
      [UID, canId, ctxQuery.circle_id, ctxQuery.id, ctxQuery.text || null,
       resp.member_id, resp.rec_note || resp.rec_name, resp.is_anonymous]);
    ck('the recommendation inserts under recs_owner', !!rec.rows[0].id);
    const recId = rec.rows[0].id;

    // ── READ IT BACK. The row, not the object we sent. ───────────────────
    const back = (await c.query(
      `select owner_id, canonical_id, circle_id, query_id, source_question,
              recommended_by_member_id, status
         from recommendations where id=$1`, [recId])).rows[0];

    ck('the row is readable back by its owner', !!back, 'RLS hid the row we just wrote');
    if (back) {
      ck('source_question holds the question (0047), read out of the database',
         back.source_question === q.text,
         'got ' + JSON.stringify(String(back.source_question).slice(0, 34)));
      ck('the Hebrew round-trips through Postgres byte for byte, Apulia included',
         back.source_question === q.text && String(back.source_question).indexOf('Apulia') > -1);
      ck('it is filed under the Travel circle that was asked',
         back.circle_id === q.circle_id, 'got ' + JSON.stringify(back.circle_id));
      ck('the query_id FK accepted the real query and links back',
         back.query_id === q.id, 'got ' + JSON.stringify(back.query_id));
      ck('the member who answered is credited, and the FK held',
         back.recommended_by_member_id === resp.member_id);
    }

    // ── THE MARK. The class of bug that hid for six days. ────────────────
    console.log('\n== marking the answer saved, via the 0046 RPC ==\n');

    const marked = (await c.query('select public.mark_response_saved($1) ok', [resp.id])).rows[0].ok;
    ck('mark_response_saved RETURNED TRUE — a row outcome, not a missing error',
       marked === true, 'returned ' + JSON.stringify(marked));

    const flag = (await c.query(
      'select saved_to_library from query_responses where id=$1', [resp.id])).rows[0];
    ck('and the flag is actually true when read back, so the button stays flipped',
       flag && flag.saved_to_library === true,
       'saved_to_library=' + (flag && flag.saved_to_library));

    const again = (await c.query('select public.mark_response_saved($1) ok', [resp.id])).rows[0].ok;
    ck('marking twice does not blow up — the Inbox can be pressed again',
       again === true || again === false, 'returned ' + JSON.stringify(again));

    // A direct UPDATE is still refused. If this ever starts working, the asker
    // can rewrite the ANSWER ITSELF, which is why 0046 used a definer function.
    const direct = await c.query(
      'update query_responses set saved_to_library=true where id=$1', [resp.id]);
    ck('a direct UPDATE still matches zero rows — the RPC is the only way in',
       direct.rowCount === 0, 'rowCount=' + direct.rowCount
       + ' — a blanket UPDATE policy would let the asker edit the answer');

    await c.query('reset role');

  } finally {
    await c.query('rollback');
  }

  // ── NOTHING KEPT ───────────────────────────────────────────────────────
  console.log('\n== the rollback ==\n');
  const after = (await c.query(
    'select count(*)::int n from recommendations where owner_id=$1', [UID])).rows[0].n;
  const canAfter = (await c.query('select count(*)::int n from canonicals')).rows[0].n;
  ck('NOTHING WAS KEPT — the library is exactly as it was',
     after === before, 'before=' + before + ' after=' + after);
  ck('...and no canonical survives', canAfter === canBefore,
     'before=' + canBefore + ' after=' + canAfter);
  const stray = (await c.query(
    'select count(*)::int n from canonicals where name=$1', [STRAY])).rows[0].n;
  ck('...and the probe row is not findable by name', stray === 0, 'found=' + stray);
  const flagNow = (await c.query(
    'select saved_to_library from query_responses where id=$1', [resp.id])).rows[0];
  ck('...and the real answer is back to the flag it came with',
     !!flagNow && flagNow.saved_to_library === resp.saved_to_library,
     'was=' + resp.saved_to_library + ' now=' + (flagNow && flagNow.saved_to_library));

  await c.end();
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message + '\n'); process.exit(1); });
