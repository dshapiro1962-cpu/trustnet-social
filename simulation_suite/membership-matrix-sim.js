// membership-matrix-sim.js — adding a person to a circle, every app member,
// every scenario, against the REAL database, rolled back.
//
// THE FAILURE, dan 9 Sep 2026: "as dshapiro8 I wanted to add shapiro
// (dshapiro3012@gmail.com) to the ski circle... the app didn't recognize it as
// an app member. Same with biriz and others. This feature already worked."
//
// It had recognised him. resolve_contact returned on_trustnet:true, the row was
// written, and trg_member_identity linked it. What was wrong was the ORDER in
// the client: link_member was called BEFORE saveMembers wrote the row, so it
// answered {ok:false, reason:"not_your_member"} about a row that did not exist,
// and the browser's own copy of linkedUserId stayed null forever. Every screen
// that reads it — the circle list, the invite button, the send paths — then
// showed a real Trustnet member as a stranger.
//
// The database was right the whole time, which is exactly why it survived: no
// query would show it, only the screen.
//
// So this sim asserts BOTH halves:
//   A. the resolver's answers, for every user and every shape of contact
//   B. link_member's ordering contract, and that the client obeys it
//
// Nothing is kept: everything runs inside one transaction, rolled back in
// `finally`, and the row counts are asserted afterwards.
//
//   node membership-matrix-sim.js         → must PASS
//   node membership-matrix-sim.js --old   → index.pre-v0.84.0.html for part B
//                                           and the pre-fix ordering for A;
//                                           must FAIL
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
if (!m0) { console.error('TRUSTNET_DB_URL not found'); process.exit(2); }
const url = m0[1].trim();

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  const users = (await c.query(
    'select id, name, email, phone from public.users order by created_at')).rows;
  const dan = users.find((u) => u.email === 'dshapiro8@hotmail.com');
  if (!dan) { console.error('owner dshapiro8@hotmail.com not found'); process.exit(2); }
  const circles = (await c.query(
    'select id, name from public.circles where owner_id=$1 order by name', [dan.id])).rows;
  const ski = circles.find((x) => x.name === 'ski');

  const beforeM = (await c.query('select count(*)::int n from public.members')).rows[0].n;
  const beforeP = (await c.query('select count(*)::int n from public.people')).rows[0].n;

  const asOwner = async (uid) => c.query(
    "select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: uid })]);
  const resolve = async (method, value, circle) => (await c.query(
    'select * from public.resolve_contact($1,$2,$3)', [method, value, circle || null])).rows[0];

  await c.query('begin');
  try {
    await asOwner(dan.id);

    // ── A1. every real account is recognised by its email ─────────────────
    console.log('\n-- every app member, by email --\n');
    const real = users.filter((u) => u.email && u.email.indexOf('@wa.trustnet.local') < 0);
    for (const u of real) {
      const r = await resolve('email', u.email);
      ck('"' + u.name + '" (' + u.email + ') is seen as an app member',
         r && r.on_trustnet === true,
         r ? 'state=' + r.state + ' on_trustnet=' + r.on_trustnet : 'no row');
    }

    // ── A2. the exact case dan reported ───────────────────────────────────
    console.log('\n-- dan\'s report, exactly --\n');
    const shap = users.find((u) => u.email === 'dshapiro3012@gmail.com');
    const rs = await resolve('email', shap.email, ski.id);
    ck('shapiro resolves against the ski circle', !!rs);
    ck('...and is on Trustnet', rs.on_trustnet === true, 'on_trustnet=' + rs.on_trustnet);
    ck('...and is reported as already in that circle, not as a stranger',
       rs.state === 'in_circle', 'state=' + rs.state);

    // ── A3. contact shapes: the answer must not depend on typing ──────────
    console.log('\n-- the same person, typed differently --\n');
    const messy = [
      ['  DShapiro3012@Gmail.COM  ', 'caps and padding'],
      ['dshapiro3012@gmail.com',     'exactly as stored'],
    ];
    for (const [v, label] of messy) {
      const r = await resolve('email', v);
      ck('email with ' + label + ' finds the same account', r && r.on_trustnet === true,
         r ? 'state=' + r.state : 'no row');
    }
    const withPhone = users.filter((u) => u.phone && u.email.indexOf('@wa.trustnet.local') < 0);
    for (const u of withPhone) {
      const forms = [u.phone, u.phone.replace(/^972/, '0'), '+' + u.phone.replace(/^\+/, '')];
      for (const f of forms) {
        const r = await resolve('whatsapp', f);
        ck('"' + u.name + '" found by phone written "' + f + '"', r && r.on_trustnet === true,
           r ? 'state=' + r.state + ' on_trustnet=' + r.on_trustnet : 'no row');
      }
    }

    // ── A4. what must NOT be reported as an account ───────────────────────
    console.log('\n-- what is not an app member --\n');
    const stranger = await resolve('email', 'nobody.at.all.9x7@example.com');
    ck('a stranger is not on Trustnet', stranger.on_trustnet === false,
       'on_trustnet=' + stranger.on_trustnet);
    ck('...and is reported as free to add', stranger.state === 'free', 'state=' + stranger.state);

    const wa = users.find((u) => u.email && u.email.indexOf('@wa.trustnet.local') > -1);
    if (wa) {
      const rw = await resolve('email', wa.email);
      ck('a synthetic wa.trustnet.local address is never an identity',
         rw.on_trustnet === false, 'on_trustnet=' + rw.on_trustnet);
    }

    // ── A5. known to me, but not in THIS circle ───────────────────────────
    console.log('\n-- known elsewhere, added here --\n');
    const other = circles.find((x) => x.id !== ski.id);
    const ro = await resolve('email', shap.email, other.id);
    ck('shapiro in "' + other.name + '" is found_person, not in_circle',
       ro.state === 'found_person', 'state=' + ro.state);
    ck('...and still reads as on Trustnet', ro.on_trustnet === true);

    // ── A6. another owner's view: identity shared, relationships not ──────
    console.log('\n-- a different owner asks about the same person --\n');
    const itamar = users.find((u) => u.email === 'itamarshapiro@gmail.com');
    if (itamar) {
      await asOwner(itamar.id);
      const ri = await resolve('email', dan.email);
      ck('another owner sees dan is on Trustnet', ri.on_trustnet === true,
         'on_trustnet=' + ri.on_trustnet);
      ck('...but is not handed dan\'s own label for someone they do not know',
         ri.state === 'on_trustnet' || ri.state === 'found_person', 'state=' + ri.state);
      await asOwner(dan.id);
    }

    // ── B. the ordering contract that actually broke ──────────────────────
    console.log('\n-- link_member: the row must exist first --\n');
    const ghost = (await c.query('select gen_random_uuid() as id')).rows[0].id;
    const before = (await c.query('select public.link_member($1) as r', [ghost])).rows[0].r;
    ck('link_member on a row that does not exist yet REFUSES',
       before && before.ok === false,
       'this is what the client used to call, before saveMembers wrote the row');

    // insert a member the way saveMembers does, then link it
    const newId = (await c.query(
      `insert into public.members (id, owner_id, circle_id, name, contact_method, contact_value,
         trust_basis, response_rate, avatar_color)
       values (gen_random_uuid(), $1, $2, 'sim probe', 'email', $3, '', 'medium', '#217A4B')
       returning id`,
      [dan.id, other.id, shap.email])).rows[0].id;

    const after = (await c.query('select public.link_member($1) as r', [newId])).rows[0].r;
    ck('link_member on the row AFTER it is written succeeds',
       after && after.ok === true && after.linked === true, JSON.stringify(after));

    const row = (await c.query(
      'select linked_user_id, person_id from public.members where id=$1', [newId])).rows[0];
    ck('the written row carries the account link',
       row.linked_user_id === shap.id, 'linked_user_id=' + row.linked_user_id);
    ck('...and joins the existing person, not a new stranger',
       !!row.person_id, 'person_id=' + row.person_id);

    // THE READBACK the client now performs. This is the value the browser was
    // never fetching, which is the whole visible bug.
    const readback = (await c.query(
      'select id, linked_user_id from public.members where id = any($1::uuid[])', [[newId]])).rows;
    ck('a readback after the save reports the link to the browser',
       readback.length === 1 && !!readback[0].linked_user_id);

  } finally {
    await c.query('rollback');
  }

  // ── B2. the client obeys the ordering ───────────────────────────────────
  console.log('\n-- the client asks in the right order --\n');
  const html = fs.readFileSync(useOld
    ? path.join(__dirname, 'index.pre-v0.84.0.html')
    : path.join(REPO, 'web', 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
  const iSave = src.indexOf('await saveMembers(touchedMemberIds)');
  const iLink = src.indexOf('for (const mid of touchedMemberIds) { await linkMemberOnServer(mid); }');
  ck('linking happens AFTER the member is written', iLink > -1 && iSave > -1 && iLink > iSave,
     'saveMembers@' + iSave + ' link@' + iLink);
  ck('the link value is read back from the rows, not guessed',
     /select\('id, linked_user_id'\)/.test(src));
  ck('...and applied to the member the browser is holding',
     /m\.linkedUserId = row\.linked_user_id \|\| null/.test(src));
// [regression] True before and after — the badge was never the broken part, it
// simply had nothing to render. It is asserted so the chain from the readback
// to the thing dan can actually SEE is held by a test, not by assumption.
  ck('[regression] the badge that says so is driven by that field',
     /m\.linkedUserId[\s\S]{0,400}On Trustnet<\/span>/.test(src));

  const afterM = (await c.query('select count(*)::int n from public.members')).rows[0].n;
  const afterP = (await c.query('select count(*)::int n from public.people')).rows[0].n;
  ck('NOTHING WAS KEPT — members unchanged', afterM === beforeM,
     'before=' + beforeM + ' after=' + afterM);
  ck('...and no person was minted', afterP === beforeP,
     'before=' + beforeP + ' after=' + afterP);

  await c.end();
  console.log('\n  ' + (useOld ? 'BASELINE v0.83.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message); process.exit(1); });
