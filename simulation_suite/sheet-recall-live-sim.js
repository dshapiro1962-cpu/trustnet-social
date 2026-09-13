// sheet-recall-live-sim.js — the answer sheet's library section, against the
// REAL database, for dan's REAL queries.
//
// WHY THIS EXISTS. On 12 Sep dan opened the answer sheet for Tom's reply to a
// Hebrew question about hotels in Apulia and got back a vet, an exterminator, a
// driving instructor and an ice-cream shop.
//
// It was not a regression. build-sheet has called match_user_recs — vector
// only, no threshold in the SQL, a caller floor of 0.25 — since the initial
// commit on 14 Jul. v0.25.0 replaced that approach with search_library_hybrid +
// an intent rerank on 28 Jul, in search-library, and never touched build-sheet.
// `git log -S match_user_recs -- supabase/functions/build-sheet/index.ts`
// returns one commit: the first. eval/eval-retrieval.js posts only to
// /search-library, so nothing measured the sheet for nine weeks.
//
// WHY VECTOR-ONLY CANNOT WORK HERE, measured on dan's rows:
//     Hebrew <-> Hebrew  0.354     Latin <-> Latin  0.264
//     Hebrew <-> Latin   0.191
// Two unrelated Hebrew items are MORE similar than a Hebrew question and the
// Italian restaurant that answers it. A 0.25 floor is below the noise.
//
// WHAT THIS ASSERTS. Row outcomes out of the real database, never the absence
// of an error:
//   1. the entity match — the primary fix — resolves what the circle NAMED
//   2. dedup: one row per thing, not one per recommendation
//   3. the old vector band really is inseparable (the measurement above)
//   4. structurally, build-sheet uses the shared recall and not the old RPC
//
// WHAT IT CANNOT ASSERT. The vector+rerank arm needs OPENAI_API_KEY, which is a
// Supabase secret and is not on this machine. That arm is the one v0.25.0's
// eval corpus already measures against search-library — the same engine this
// change adopts — and it is validated by running eval/eval-retrieval.js.
// This sim covers everything that does not need the key, and says so.
//
//   node sheet-recall-live-sim.js         → must PASS
//   node sheet-recall-live-sim.js --old   → build-sheet.pre-v0.90.0.ts, must FAIL
//
// Needs .env.local for TRUSTNET_DB_URL; skips cleanly without it. READ ONLY —
// it writes nothing, so there is no rollback to prove.

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

const SHEET = useOld
  ? path.join(__dirname, 'build-sheet.pre-v0.90.0.ts')
  : path.join(REPO, 'supabase', 'functions', 'build-sheet', 'index.ts');
const RECALL = path.join(REPO, 'supabase', 'functions', '_shared', 'library_recall.ts');

const UID = 'c7af8222-f595-455b-83d4-d848a8bd621a';
const STRAYS = ['גל המדביר', 'אילן הווטרינר', 'רועי מורה נהיגה'];

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  console.log('\n   fixture: ' + path.basename(SHEET) + (useOld ? '   (must FAIL)' : '') + '\n');
  const src = fs.readFileSync(SHEET, 'utf8');

  // ── 1. STRUCTURAL: which engine does the sheet reach for? ───────────────
  console.log('== which retrieval does build-sheet use? ==\n');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ck('it no longer calls match_user_recs', code.indexOf('match_user_recs') < 0,
     'still on the July mechanism that search-library left behind on 28 Jul');
  ck('it calls the shared libraryRecall', code.indexOf('libraryRecall') > -1);
  ck('the shared module exists', fs.existsSync(RECALL));
  if (fs.existsSync(RECALL)) {
    const rc = fs.readFileSync(RECALL, 'utf8').replace(/\/\/[^\n]*/g, '');
    ck('the shared module uses search_library_hybrid — the same RPC as search',
       rc.indexOf('search_library_hybrid') > -1);
    ck('it FAILS CLOSED: every error path returns an empty list',
       /return \{ hits: \[\], error:/.test(rc)
       && !/forEach[^;]*relevant[^;]*true/.test(rc),
       'the old code marked every candidate relevant when the judge was unavailable');
  }
  ck('the fail-open judge loop is gone from the sheet',
     code.indexOf('libRelevant') < 0,
     'library.forEach(... libRelevant[i] = true) showed everything on 5 failure paths');

  // ── 1b. THE TWO DEFECTS THE 13 SEP EVAL EXPOSED ─────────────────────────
  console.log('\n== the two defects the eval found, on the real strings ==\n');

  // THE REFERENCE FILTER ATE REAL ANSWERS. On "bridge in Brooklyn" the
  // classifier returns reference "Brooklyn". The old filter dropped any answer
  // whose name CONTAINED it, so the Brooklyn Bridge was deleted as though it
  // were the thing being compared against. Two of forty answers vanished.
  const refContains = /keyName\.includes\(refNorm\)/.test(code)
                   || /norm\(l\.name\)\.includes\(refNorm\)/.test(code);
  ck('the reference filter matches EXACTLY, not by containment', !refContains,
     'containment deletes the Brooklyn Bridge under reference "Brooklyn"');
  // The consequence, stated as data rather than asserted in the abstract.
  const nrm = (x) => x.trim().toLowerCase().replace(/\s+/g, ' ');
  ck('...and that mattered: "brooklyn bridge" really does contain "Brooklyn"',
     nrm('brooklyn bridge').includes(nrm('Brooklyn'))
     && nrm('Hampstead Heath').includes(nrm('Hampstead')),
     'if this stops holding the assertion above is measuring nothing');

  // THE DUPLICATED NOTE, introduced 13 Sep by the entity match. The library
  // copy of an answer is stored prefixed with the speaker, the response note
  // is bare, so exact equality never matched and Tom's narrative printed twice.
  const sn = (src.match(/function sameNote\([\s\S]*?\n\}/) || [''])[0]
    .replace(/: string/g, '').replace(/: boolean/g, '');
  ck('build-sheet has a note comparison that is not exact equality', !!sn,
     'without it "Tom Shapiro: <text>" and "<text>" are two different notes');
  if (sn) {
    // sameNote leans on build-sheet's own norm(); lift that too rather than
    // reimplement it, or the test would be measuring a copy.
    const nm = (src.match(/function norm\([\s\S]*?\n\}/) || [''])[0]
      .replace(/: string/g, '');
    // eslint-disable-next-line no-eval
    const sameNote = eval('(function(){' + nm + '\n' + sn + '\nreturn sameNote;})()');
    const bare = 'עשינו לילה אחד בבארי, משם אנחנו לקחנו אופניים אבל אפשר גם עם רכב';
    ck('THE REAL sameNote sees through the "Name: " prefix',
       sameNote('Tom Shapiro: ' + bare, bare) === true,
       'this exact pair printed twice on Tom\'s sheet on 13 Sep');
    ck('it still treats genuinely different testimony as different',
       sameNote(bare, 'לגמרי מקום אחר, לא הייתי חוזר לשם שוב בחיים') === false);
    ck('and a short note cannot swallow a long one',
       sameNote('כן', bare) === false,
       'containment without a length floor makes every short note a duplicate');
  }

  // ── 1c. THE KIND-BEFORE-PLACE RULE ──────────────────────────────────────
  // STRUCTURAL ONLY, and it says so: this asserts the instruction is present in
  // the rerank prompt, not that the model obeys it. Obedience is measured by
  // eval/eval-sheet.js against the deployed function - the two additions to
  // watch are "wine shop in RAMAT-GAN" and "best coffe in rama gan", which on
  // 13 Sep both returned סביח עובד, a sabich stall, because it is the only food
  // in Ramat Gan in the library.
  if (fs.existsSync(RECALL)) {
    const rc = fs.readFileSync(RECALL, 'utf8');
    const prompt = rc.replace(/\/\/[^\n]*/g, '');   // the rule must be in the PROMPT, not a comment
    ck('the rerank prompt says a shared location is not relevance',
       /SHARED LOCATION IS NOT RELEVANCE/.test(prompt),
       'a sabich stall answered a question about a wine shop on 13 Sep');
    ck('...and it still allows a place to answer "where to go" in that region',
       /place to VISIT does/.test(prompt),
       'over-correcting here would drop מאטרה from the Apulia sheet, which is RIGHT');
    ck('the "empty beats wrong" instruction is still there',
       /empty answer beats a wrong one/.test(prompt));
  }

  // ── 1d. "0 FROM YOUR CIRCLE" ON A SHEET FULL OF CIRCLE ANSWERS ─────────
  // Run the REAL counts expressions over the REAL payload build-sheet returned
  // for dan's Apulia query on 13 Sep: may answered, Tom answered, both answers
  // had been kept, and the header said 0.
  console.log('\n== the counts, over the payload the live function returned ==\n');
  {
    const items = [
      { name: 'מאטרה', from_you: true, recommenders: [] },
      { name: 'מאטרה, בארי, פוליאנו אה מארה, Alberobello', from_you: true, recommenders: ['may shapiro'] },
      { name: 'טיול עם רכב באיזור בארי', from_you: true, recommenders: ['Tom Shapiro'] },
    ];
    const line = (src.match(/from_circle: items\.filter\([^\n]*/) || [''])[0];
    ck('build-sheet has a from_circle count to check', !!line);
    if (line) {
      const expr = line.replace(/^\s*from_circle:\s*/, '').replace(/,\s*$/, '');
      // eslint-disable-next-line no-eval
      const fromCircle = eval('(function(items){ return ' + expr + '; })')(items);
      ck('THE REAL from_circle counts what the circle named, kept or not',
         fromCircle === 2,
         'got ' + fromCircle + ' - may and Tom both answered this query');
    }
    const fy = (src.match(/from_you: items\.filter\([^\n]*/) || [''])[0]
      .replace(/^\s*from_you:\s*/, '').replace(/,\s*$/, '');
    const co = (src.match(/corroborated: items\.filter\([^\n]*/) || [''])[0]
      .replace(/^\s*corroborated:\s*/, '').replace(/,\s*$/, '');
    if (fy && co) {
      // eslint-disable-next-line no-eval
      const nFy = eval('(function(items){ return ' + fy + '; })')(items);
      // eslint-disable-next-line no-eval
      const nCo = eval('(function(items){ return ' + co + '; })')(items);
      ck('"you already had" still means library-only additions', nFy === 1,
         'got ' + nFy);
      ck('"corroborated" still means they named it AND you hold it', nCo === 2,
         'got ' + nCo);
    }
  }

  // ── 2. THE OLD BAND: is vector-only actually inseparable? ───────────────
  console.log('\n== why a threshold cannot fix the old path ==\n');
  const lang = (await c.query(
    `with v as (
       select distinct on (cn.name) cn.name, (cn.name ~ '[֐-׿]') heb, cn.embedding
         from recommendations r join canonicals cn on cn.id=r.canonical_id
        where r.owner_id=$1 and cn.embedding is not null order by cn.name)
     select a.heb ah, b.heb bh, avg(1 - (a.embedding <=> b.embedding)) s
       from v a join v b on a.name <> b.name group by a.heb, b.heb`, [UID])).rows;
  const get = (ah, bh) => Number((lang.find((r) => r.ah === ah && r.bh === bh) || {}).s || 0);
  const hebHeb = get(true, true), hebLat = get(true, false), latLat = get(false, false);
  console.log('        Hebrew<->Hebrew ' + hebHeb.toFixed(3)
    + '   Latin<->Latin ' + latLat.toFixed(3)
    + '   Hebrew<->Latin ' + hebLat.toFixed(3) + '\n');
  ck('same-language noise outscores cross-language meaning', hebHeb > hebLat,
     'if this ever stops holding, a single threshold might work after all');
  ck('the old 0.25 floor sits BELOW the same-language noise floor', 0.25 < hebHeb,
     'floor=0.25 vs Hebrew-Hebrew mean ' + hebHeb.toFixed(3));

  // ── 3. DEDUP: one row per thing ────────────────────────────────────────
  console.log('\n== one row per thing, not one per recommendation ==\n');
  const dup = (await c.query(
    `select count(*)::int rows, count(distinct cn.id)::int things
       from recommendations r join canonicals cn on cn.id=r.canonical_id
      where r.owner_id=$1 and cn.embedding is not null`, [UID])).rows[0];
  console.log('        library: ' + dup.rows + ' rows over ' + dup.things + ' distinct things\n');
  const raw = (await c.query(
    `select * from public.search_library_hybrid($1, null, $2, 30)`,
    [UID, 'חבר נוסע לאיטליה לאזור Apulia מבקש המלצות למלונות ומסעדות'])).rows;
  const seen = new Set();
  const deduped = raw.filter((h) => {
    const k = h.canonical_id || h.rec_id;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  console.log('        30 candidates -> ' + deduped.length + ' distinct after the dedup the fix applies');
  ck('duplicates really do crowd the candidate slots', dup.rows > dup.things,
     'nothing to dedup — this assertion would be measuring nothing');
  ck('the dedup collapses them', deduped.length < raw.length,
     raw.length + ' -> ' + deduped.length);
  const shared = fs.existsSync(RECALL) ? fs.readFileSync(RECALL, 'utf8') : '';
  ck('and the shipped code does that dedup, keyed on the canonical',
     /seen\.has\(k\)/.test(shared) && /canonical_id/.test(shared));

  // ── 4. THE PRIMARY FIX: what did the circle actually name? ──────────────
  console.log('\n== the entity match, over every answered query dan has ==\n');
  const qs = (await c.query(
    `select distinct q.id, q.text from queries q
       join query_responses qr on qr.query_id=q.id
      where qr.responded_at is not null and qr.rec_name is not null
      order by q.text`)).rows;
  console.log('        ' + qs.length + ' answered queries in the account\n');

  let resolved = 0, held = 0, total = 0, strayHit = 0;
  for (const q of qs) {
    const answers = (await c.query(
      `select qr.rec_name, qr.rec_location, m.name who from query_responses qr
         left join members m on m.id=qr.member_id
        where qr.query_id=$1 and qr.responded_at is not null and qr.rec_name is not null`,
      [q.id])).rows;
    const lines = [];
    for (const a of answers) {
      total++;
      const { rows: [{ id }] } = await c.query(
        'select public.match_canonical($1,$2,null) id', [a.rec_name, a.rec_location || null]);
      if (id) resolved++;
      let own = null;
      if (id) {
        own = (await c.query(
          `select cn.name from recommendations r join canonicals cn on cn.id=r.canonical_id
            where r.owner_id=$1 and r.canonical_id=$2 limit 1`, [UID, id])).rows[0];
        if (own) held++;
        if (own && STRAYS.some((s) => String(own.name).includes(s))) strayHit++;
      }
      lines.push('          "' + String(a.rec_name).slice(0, 34) + '" -> '
        + (id ? (own ? 'HELD as "' + String(own.name).slice(0, 26) + '"' : 'resolved, not held') : 'no match'));
    }
    console.log('        ' + String(q.text).slice(0, 56));
    lines.forEach((l) => console.log(l));
  }
  console.log('');
  ck('the entity match resolves most of what the circle named',
     resolved > 0 && resolved / total >= 0.5, resolved + ' of ' + total + ' answers resolved');
  ck('it finds the ones already in the library', held > 0, held + ' held of ' + total);
  ck('IT NEVER RETURNS A STRAY — it only answers about things the circle named',
     strayHit === 0, strayHit + ' strays reached the sheet through the entity match');

  // The specific failure dan reported.
  const apulia = (await c.query(
    `select id, text from queries where text ilike '%Apulia%' order by sent_at desc limit 1`)).rows[0];
  if (apulia) {
    const names = (await c.query(
      `select qr.rec_name from query_responses qr
        where qr.query_id=$1 and qr.responded_at is not null and qr.rec_name is not null`,
      [apulia.id])).rows.map((r) => r.rec_name);
    const hits = [];
    for (const n of names) {
      const { rows: [{ id }] } = await c.query('select public.match_canonical($1,null,null) id', [n]);
      if (id) hits.push(id);
    }
    ck("Tom's and may's answers both resolve on the query dan reported",
       hits.length === names.length, hits.length + ' of ' + names.length);
    const strayResolved = [];
    for (const s of STRAYS) {
      const { rows: [{ id }] } = await c.query('select public.match_canonical($1,null,null) id', [s]);
      if (id && hits.includes(id)) strayResolved.push(s);
    }
    ck('and no stray resolves to anything those answers named',
       strayResolved.length === 0, strayResolved.join(', '));
  }

  await c.end();
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message + '\n'); process.exit(1); });
