// save-path-live-sim.js — the chat-import save, executed against the REAL
// database inside a transaction that is always rolled back.
//
// WHY THIS EXISTS. On 9 Sep 2026 the save broke twice in one afternoon and
// neither break was reachable by any test in this repo:
//
//   1. A collection built only from rows that were INSERTED. dan deleted a
//      list, re-imported to rebuild it, and got a page reading
//      "RECOMMENDATION 1" — 22 of 23 items were already in his library, so they
//      were correctly skipped and wrongly left off the list.
//   2. `have.add(...)` left pointing at a Set that had become a Map. It threw
//      ReferenceError on the first item that was NOT skipped, uncaught, so the
//      platform answered 500 with no CORS headers and the browser said only
//      "Failed to fetch".
//
// The sims were all source checks. They cannot fail the way production failed.
// This one runs the actual sequence — match_canonical, the canonical insert,
// the recommendation insert, the collection and its items — over dan's real
// rows, with the real schema and the real constraints.
//
// It does NOT execute the deployed Deno code: there is no user JWT here.
// typecheck-functions.js covers the reference-error class, with a control.
//
// NOTHING IS KEPT. The rollback is in `finally`, and the row counts are
// asserted afterwards to prove it.
//
//   node save-path-live-sim.js         → must PASS
//   node save-path-live-sim.js --old   → restores the pre-fix collection
//                                        behaviour and must FAIL, reproducing
//                                        the short list dan saw
//
// Needs tools/.env.local for TRUSTNET_DB_URL; skips cleanly without it.
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
const env = fs.readFileSync(envPath, 'utf8');
const m0 = env.match(/TRUSTNET_DB_URL\s*=\s*(.+)/);
if (!m0) { console.error('TRUSTNET_DB_URL not found in .env.local'); process.exit(2); }
const url = m0[1].trim();
const UID = 'c7af8222-f595-455b-83d4-d848a8bd621a';
const SOURCE = 'קבוצת וואטסאפ · WhatsApp chat';   // dan's real label

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// Real items from dan's chat. The first is the one that crashed the save: it is
// NOT already held under this note, so it takes the insert path — the exact
// branch that hit `have.add` and threw.
const ITEMS = [
  { name: 'גל המדביר', location: '', phone: '0526201668', category: 'professional',
    note: ['מקצועי, אמין, אחראי', 'מחירים טובים, אמין ומצויין',
           'מדביר אצלי פעם בשנה כבר 8 שנים'].join(' · ') },
  { name: 'בדיקה זמנית שלא קיימת', location: 'רמת גן', phone: '0500000000',
    category: 'professional', note: 'פריט חדש לגמרי — נתיב ה-insert' },
  { name: 'נתן אינסטלטור', location: '', phone: '0522539277', category: 'professional',
    note: 'אינסטלטור אמין ישר ולא יקרן' },   // his row has a trailing '.'
];

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  const before = (await c.query(
    'select count(*)::int n from recommendations where owner_id=$1', [UID])).rows[0].n;

  await c.query('begin');
  try {
    console.log('\n-- the save sequence, against the real schema --\n');

    // 1. the "do I already have this?" map, exactly as the function builds it
    const norm = (s) => (s || '').toLowerCase()
      .replace(/[.,!?;:'"׳״()\[\]\-‐-―''""…·\/]/g, ' ').replace(/\s+/g, ' ').trim();
    const key = (canId, src, note) => canId + '\u0000' + (src || '').toLowerCase().trim()
      + '\u0000' + norm(note);
    const mine = (await c.query(
      'select id, canonical_id, source_label, note from recommendations where owner_id=$1',
      [UID])).rows;
    const haveId = new Map();
    for (const r of mine) {
      if (!r.canonical_id) continue;
      const k = key(r.canonical_id, r.source_label, r.note);
      if (!haveId.has(k)) haveId.set(k, r.id);
    }
    ck('the existing-library map builds over all ' + mine.length + ' rows', haveId.size > 0,
       'size=' + haveId.size);

    const recIds = [];
    let saved = 0, skipped = 0, reused = 0;

    for (const it of ITEMS) {
      const m = await c.query('select public.match_canonical($1,$2,$3) as id',
        [it.name.trim(), it.location || null, it.phone || null]);
      let canonicalId = m.rows[0].id;
      if (canonicalId) reused++;

      const already = canonicalId ? haveId.get(key(canonicalId, SOURCE, it.note)) : undefined;
      if (already) {
        skipped++;
        // THE CONTROL restores what the code did before 9 Sep: a skipped item
        // simply `continue`d, so anything already in the library fell off the
        // shared list. That is precisely how a 23-item import became a page
        // reading "RECOMMENDATION 1".
        if (!useOld && recIds.indexOf(already) < 0) recIds.push(already);
        continue;
      }

      if (!canonicalId) {
        const ins = await c.query(
          `insert into canonicals (type,name,category,location,image_emoji,created_by,
             primary_category,class_source,classified_at,search_doc,search_doc_at,
             website_url,image_url,phone)
           values ('place',$1,'',$2,'📌',$3,$4,'ai',now(),$5,now(),null,null,$6)
           returning id`,
          [it.name, it.location || '', UID, it.category, it.name + ' ' + it.note,
           (it.phone || '').trim() || null]);
        canonicalId = ins.rows[0].id;
      }

      const rec = await c.query(
        `insert into recommendations (owner_id,canonical_id,circle_id,recommended_by_user_id,
           note,rating,status,is_anonymous,degree,shared_to_network,rec_date,source_label)
         values ($1,$2,null,$1,$3,null,'saved',false,1,false,current_date,$4)
         returning id`,
        [UID, canonicalId, it.note, SOURCE]);

      // THE LINE THAT CRASHED. It wrote to a Set that no longer existed.
      haveId.set(key(canonicalId, SOURCE, it.note), rec.rows[0].id);
      recIds.push(rec.rows[0].id);
      saved++;
    }

    ck('every item produced a row for the list', recIds.length === ITEMS.length,
       'recIds=' + recIds.length + ' of ' + ITEMS.length);
    ck('the joined 3-endorsement note is accepted (400-char cap vs 1000 check)',
       saved + skipped === ITEMS.length, 'saved=' + saved + ' skipped=' + skipped);
    console.log('        saved=' + saved + '  skipped=' + skipped + '  reused=' + reused);

    // 2. the collection, built from recIds — new AND already-held alike
    const col = await c.query(
      `insert into collections (owner_id,token,title,description)
       values ($1,$2,$3,$4) returning id`,
      [UID, 'simtoken0001', 'בדיקה', 'נאסף משיחת הקבוצה — test']);
    for (let i = 0; i < recIds.length; i++) {
      await c.query('insert into collection_items (collection_id,rec_id,position) values ($1,$2,$3)',
        [col.rows[0].id, recIds[i], i]);
    }
    const items = (await c.query(
      'select count(*)::int n from collection_items where collection_id=$1', [col.rows[0].id]))
      .rows[0].n;
    ck('the collection carries every selected item, not only the new ones',
       items === ITEMS.length, 'collection_items=' + items);

    // 3. what the public page would then serve
    const page = await c.query(
      `select can.name, can.phone from collection_items ci
         join recommendations r on r.id=ci.rec_id
         join canonicals can on can.id=r.canonical_id
        where ci.collection_id=$1 order by ci.position`, [col.rows[0].id]);
    ck('the shared page would show a number for the ones that have one',
       page.rows.filter((r) => r.phone).length >= 2,
       page.rows.map((r) => r.name + '=' + (r.phone || '-')).join(', '));

  } finally {
    await c.query('rollback');
  }

  const after = (await c.query(
    'select count(*)::int n from recommendations where owner_id=$1', [UID])).rows[0].n;
  ck('NOTHING WAS KEPT — the library is exactly as it was',
     after === before, 'before=' + before + ' after=' + after);
  const stray = (await c.query(
    "select count(*)::int n from collections where token='simtoken0001'")).rows[0].n;
  ck('...and no test collection survives', stray === 0, 'found=' + stray);

  await c.end();
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message); process.exit(1); });
