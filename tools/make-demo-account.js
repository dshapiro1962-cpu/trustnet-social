// ═══════════════════════════════════════════════════════════════════════════
// make-demo-account.js — the account a Meta reviewer tests the connector with.
//
// WHY IT HAS TO EXIST. Step 3 of the Muse connector submission includes
// end-to-end testing, and a reviewer cannot get a working Trustnet account:
// sign-in is a WhatsApp message or an email link, and a fresh account has no
// library and no circles, so every tool would return empty and the connector
// would look broken rather than private.
//
// A reviewer does not need to sign into the app at all. They need a CONNECTOR
// TOKEN against an account with something in it. That is what this builds.
//
// ── NOBODY REAL IS EVER CONTACTED ──────────────────────────────────────────
// The demo circle's members are email members whose addresses are plus-
// addressed to the owner's own inbox (SINK below). So if a reviewer presses
// Send on the confirm page, the flow completes honestly — send-query runs, the
// page says Sent — and the six messages land in one inbox belonging to the
// person who built the demo. No stranger is messaged.
//
// The alternatives were worse. All-external members make send-query return
// `circle_has_no_reachable_members`, so a reviewer pressing Send would see a
// failure and conclude the product is broken. Addresses at example.com are
// undeliverable, which is safe but bounces. This is the only option where the
// demo tells the truth and costs nobody anything.
//
// The businesses in the library are INVENTED. Demo data must not put made-up
// opinions in the mouth of a real restaurant or a real doctor.
//
// Re-runnable: it finds the demo account by email and rebuilds its contents,
// so running it twice leaves one demo, not two. It prints a fresh connector
// token each time, because only the sha256 is stored and the old one can never
// be read back.
//
//   node tools/make-demo-account.js
//   node tools/make-demo-account.js --token-only    (just mint a new token)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, 'node_modules', 'pg'));

const REPO = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const URL = env.match(/TRUSTNET_DB_URL\s*=\s*(.+)/)[1].trim();

const DEMO_EMAIL = 'demo@trustnet.example';        // .example is reserved: never routable
const DEMO_NAME = 'Trustnet Demo';
// Where a demo send actually goes. One address, plus-addressed per member.
const SINK = 'dshapiro1962@gmail.com';
const tokenOnly = process.argv.indexOf('--token-only') > -1;

const sink = (who) => SINK.replace('@', '+tn-demo-' + who.toLowerCase() + '@');

const CIRCLES = [
  { key: 'puglia', name: 'Puglia trip', domain: 'travel',
    description: 'People who know the south of Italy',
    members: ['Tal', 'Michal', 'Yoni', 'Dafna', 'Ron', 'Ayelet'] },
  { key: 'doctors', name: 'Doctors', domain: 'healthcare',
    description: 'Who I ask when something hurts',
    members: ['Noa', 'Eitan', 'Shira'] },
  { key: 'books', name: 'Books', domain: 'culture',
    description: 'People whose reading I steal',
    members: ['Gil', 'Maya', 'Amir', 'Tamar'] },
];

// INVENTED establishments. Nothing here is a real business, so nothing here
// puts an invented opinion in a real proprietor's mouth.
const LIBRARY = [
  { circle: 'puglia', name: 'Masseria Belloluce', cat: 'travel', loc: 'Ostuni, Italy',
    kind: 'place to stay', emoji: '\u{1F3E1}', rating: 5, by: 'Tal',
    note: 'Old farmhouse, twelve rooms, breakfast under the fig tree. Ask for the room on the corner — it gets the evening light.' },
  { circle: 'puglia', name: 'Pescheria da Nino', cat: 'dining', loc: 'Polignano a Mare, Italy',
    kind: 'restaurant', emoji: '\u{1F41F}', rating: 5, by: 'Michal',
    note: 'Fish counter at the front, eight tables at the back. No menu, they just tell you what came in. Cash.' },
  { circle: 'puglia', name: 'Forno Santa Chiara', cat: 'dining', loc: 'Lecce, Italy',
    kind: 'bakery', emoji: '\u{1F35E}', rating: 4, by: 'Yoni',
    note: 'Go before nine. The rustico is the thing, and they run out.' },
  { circle: 'puglia', name: 'Cantina Vecchio Muro', cat: 'dining', loc: 'Alberobello, Italy',
    kind: 'wine', emoji: '\u{1F377}', rating: 4, by: 'Dafna',
    note: 'Primitivo straight from the barrel. They will fill a bottle to take away if you ask nicely.' },
  { circle: 'puglia', name: 'Spiaggia di Torre Rossa', cat: 'travel', loc: 'near Monopoli, Italy',
    kind: 'beach', emoji: '\u{1F3D6}️', rating: 4, by: 'Ron',
    note: 'Rocks rather than sand, and almost empty on a weekday. Bring shoes for the water.' },
  { circle: 'doctors', name: 'Dr Lena Hart', cat: 'healthcare', loc: 'Tel Aviv',
    kind: 'paediatrician', emoji: '\u{1FA7A}', rating: 5, by: 'Noa',
    note: 'Explains things to the child rather than over their head. Runs late, always worth it.' },
  { circle: 'doctors', name: 'Ortho Clinic Ramat', cat: 'healthcare', loc: 'Ramat Gan',
    kind: 'physiotherapy', emoji: '\u{1F9B5}', rating: 4, by: 'Eitan',
    note: 'Fixed my shoulder in five sessions after a year of being told to rest it.' },
  { circle: 'books', name: 'The Salt House', cat: 'culture', loc: null,
    kind: 'novel', emoji: '\u{1F4D6}', rating: 5, by: 'Maya',
    note: 'Quiet book about a family and a coastline. Read it in two nights.' },
  { circle: 'books', name: 'A History of Forgetting', cat: 'culture', loc: null,
    kind: 'non-fiction', emoji: '\u{1F4DA}', rating: 4, by: 'Gil',
    note: 'Slow first fifty pages, then it opens right up. Stayed with me for months.' },
  { circle: 'books', name: 'Pages & Co', cat: 'culture', loc: 'Jaffa',
    kind: 'bookshop', emoji: '\u{1F4D7}', rating: 5, by: 'Tamar',
    note: 'Tiny, and whoever is behind the counter has actually read the stock.' },
];

// An answered question, so get_answers has something real to return.
const ANSWERED = {
  circle: 'puglia',
  text: 'Anyone been to Lecce? Looking for somewhere to eat, early October, two adults.',
  answers: [
    { by: 'Yoni', name: 'Forno Santa Chiara', note: 'Best thing in the old town, but go early.', loc: 'Lecce, Italy' },
    { by: 'Michal', name: 'Trattoria Sette Archi', note: 'Family run, one room, orecchiette made that morning.', loc: 'Lecce, Italy' },
    { by: 'Tal', name: 'Trattoria Sette Archi', note: 'Seconding this — we ate there twice in three days.', loc: 'Lecce, Italy' },
  ],
};

const log = (s) => console.log(s);

(async () => {
  const c = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  // ── the account ──────────────────────────────────────────────────────────
  let uid = (await c.query('select id from auth.users where email = $1', [DEMO_EMAIL])).rows[0]?.id;

  if (!uid && tokenOnly) { console.error('no demo account yet — run without --token-only first'); process.exit(1); }

  if (!uid) {
    // Shaped like the rows that already work in this database: instance_id
    // set, aud and role 'authenticated', email confirmed, provider 'email'.
    // The password is a bcrypt of 32 random bytes nobody ever sees, so the
    // account cannot be password-signed-into; the connector token is its only
    // door, and magic-link minting still works for the server.
    uid = (await c.query(
      "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, " +
      "email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, " +
      "confirmation_token, recovery_token, email_change_token_new, email_change) " +
      "values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', " +
      "'authenticated', $1, extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'), " +
      "extensions.gen_salt('bf')), now(), now(), now(), " +
      "'{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb, $2::jsonb, " +
      // THESE MUST BE '' AND NOT NULL. GoTrue's admin API scans auth.users
      // into Go structs where these four are plain strings, so a NULL that a
      // hand-written INSERT leaves behind makes getUserById fail - and it
      // fails as "user not found", which looks exactly like a bad token from
      // the outside. Cost an hour on 26 Sep. Rows GoTrue creates itself have
      // '' here; this matches them.
      "'', '', '', '') returning id",
      [DEMO_EMAIL, JSON.stringify({ name: DEMO_NAME, demo: true })])).rows[0].id;
    log('  created auth user  ' + uid);
  } else {
    log('  found auth user    ' + uid);
  }

  await c.query(
    "insert into public.users (id, name, avatar, avatar_color, email, bio, location) " +
    "values ($1, $2, 'TD', '#1D5A45', $3, " +
    "'Demo account for the Trustnet connector. Everything in it is invented.', 'Tel Aviv') " +
    "on conflict (id) do update set name = excluded.name, bio = excluded.bio",
    [uid, DEMO_NAME, DEMO_EMAIL]);

  if (!tokenOnly) {
    // ── wipe and rebuild, so re-running leaves ONE demo ────────────────────
    await c.query('delete from public.query_responses where query_id in (select id from public.queries where sent_by = $1)', [uid]);
    await c.query('delete from public.queries where sent_by = $1', [uid]);
    await c.query('delete from public.recommendations where owner_id = $1', [uid]);
    await c.query('delete from public.members where owner_id = $1', [uid]);
    await c.query('delete from public.circles where owner_id = $1', [uid]);
    log('  cleared previous demo contents');

    const circleId = {}, memberId = {};
    for (const cir of CIRCLES) {
      const id = (await c.query(
        'insert into public.circles (owner_id, name, domain, description, location) ' +
        'values ($1,$2,$3,$4,$5) returning id',
        [uid, cir.name, cir.domain, cir.description, 'Tel Aviv'])).rows[0].id;
      circleId[cir.key] = id;
      for (const who of cir.members) {
        const mid = (await c.query(
          'insert into public.members (circle_id, owner_id, name, contact_method, contact_value, ' +
          'trust_basis, response_rate) values ($1,$2,$3,$4,$5,$6,$7) returning id',
          [id, uid, who, 'email', sink(who),
           'Demo member. Messages reach the demo owner and nobody else.', 'high'])).rows[0].id;
        memberId[cir.key + ':' + who] = mid;
      }
      log('  circle  ' + cir.name.padEnd(12) + cir.members.length + ' people');
    }

    for (const r of LIBRARY) {
      const canId = (await c.query(
        'insert into public.canonicals (type, name, category, location, kind, image_emoji, ' +
        'primary_category, created_by, description) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
        ['place', r.name, r.cat, r.loc, r.kind, r.emoji, r.cat, uid, r.note.slice(0, 160)])).rows[0].id;
      await c.query(
        'insert into public.recommendations (canonical_id, circle_id, owner_id, ' +
        'recommended_by_member_id, note, rating, category, tags, status) ' +
        'values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [canId, circleId[r.circle], uid, memberId[r.circle + ':' + r.by],
         // 'saved' is what 200 of the 201 live rows use, and the check
         // constraint allows available/visited/saved/dismissed. 'active' is
         // not a status this schema has.
         r.note, r.rating, r.kind, [r.cat, r.kind], 'saved']);
    }
    log('  library ' + LIBRARY.length + ' recommendations');

    // An answered question. response_token is NOT NULL and single-use; these
    // are marked used, because these answers have already come in.
    const qid = (await c.query(
      "insert into public.queries (circle_id, sent_by, text, degree, status, sent_at) " +
      "values ($1,$2,$3,1,'sent', now() - interval '3 days') returning id",
      [circleId[ANSWERED.circle], uid, ANSWERED.text])).rows[0].id;

    for (const a of ANSWERED.answers) {
      const canId = (await c.query(
        'insert into public.canonicals (type, name, category, location, primary_category, created_by) ' +
        "values ('place',$1,'dining',$2,'dining',$3) returning id", [a.name, a.loc, uid])).rows[0].id;
      await c.query(
        'insert into public.query_responses (query_id, member_id, canonical_id, rec_name, rec_note, ' +
        "rec_location, response_token, token_used, responded_at, send_status) " +
        "values ($1,$2,$3,$4,$5,$6, 'demo-' || encode(extensions.gen_random_bytes(16),'hex'), " +
        "true, now() - interval '2 days', 'responded')",
        [qid, memberId[ANSWERED.circle + ':' + a.by], canId, a.name, a.note, a.loc]);
    }
    log('  question with ' + ANSWERED.answers.length + ' answers');
  }

  // ── the token ────────────────────────────────────────────────────────────
  // mint_connector_token reads auth.uid(), so it is called as the demo member.
  await c.query('begin');
  await c.query('set local role authenticated');
  await c.query(
    "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
    [uid]);
  const token = (await c.query("select public.mint_connector_token('Muse review') as t")).rows[0].t;
  await c.query('commit');

  log('\n  ─────────────────────────────────────────────────────────────');
  log('  demo account : ' + DEMO_EMAIL);
  log('  user id      : ' + uid);
  log('  sends reach  : ' + SINK + ' (plus-addressed), nobody else');
  log('\n  CONNECTOR TOKEN, shown once — only its sha256 is stored:\n');
  log('  ' + token);
  log('\n  ─────────────────────────────────────────────────────────────\n');

  await c.end();
})().catch((e) => { console.error('\nFATAL ' + e.message + '\n'); process.exit(1); });
