// join-adopts-sim.js — joining a circle adopts the row the owner already wrote.
//
// WHAT HAPPENED, measured in production on 21 Sep 2026 while dan tested an
// ordinary invite:
//
//   15:27:46  dan types naama into leros — whatsapp +972…467, linked_user_id
//             null, because she had no account yet
//   15:32:45  she presses send in WhatsApp; the claim is recorded
//   15:33:14  complete-join creates her ACCOUNT
//   —         the membership insert is refused by members_person_circle_uniq:
//             dan's own row already holds that person in that circle. The claim
//             is never consumed, `uses` never increments, and she reads
//             "Couldn't finish signing you in." Tapping again repeats it.
//
// Both join paths looked for a member carrying the joiner's USER id. A row
// typed before that person had an account can never carry one, so both always
// tried to insert and the database always refused. EVERY invite to someone
// already in the circle failed this way. The 11 joins that ever worked were
// all people joining a circle they were not already in.
//
// WHAT THIS RUNS: the REAL functions against the REAL database — the real
// identity trigger, the real unique index — inside a transaction that is
// ALWAYS rolled back. It proves the environment before asserting anything: if
// the constraint or the trigger is missing, nothing below it is evidence.
//
//   node join-adopts-sim.js         → must PASS
//   node join-adopts-sim.js --old   → restores the pre-0051 code path
//                                     (join_circle_via_link exactly as
//                                     0025_recover_functions.sql defines it,
//                                     and complete-join's own select-then-
//                                     insert) and must FAIL, reproducing what
//                                     naama hit.
//
// Needs .env.local for TRUSTNET_DB_URL; skips cleanly (exit 2) without it.

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
const url = (fs.readFileSync(envPath, 'utf8').match(/TRUSTNET_DB_URL\s*=\s*(.+)/) || [])[1].trim();
const OWNER = 'c7af8222-f595-455b-83d4-d848a8bd621a';   // dan
const PHONE = '+972500000917';   // nobody's real number
const EMAIL = 'beta.tester.917@example.com';

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 180) : '')); }
};

// THE BASELINE THIS FIX WAS MADE AGAINST: join_circle_via_link as it stood in
// 0025_recover_functions.sql, read from the file rather than retyped here.
function oldJoinViaLink() {
  const src = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', '0025_recover_functions.sql'), 'utf8');
  const at = src.indexOf('CREATE OR REPLACE FUNCTION public.join_circle_via_link');
  if (at < 0) return null;
  const end = src.indexOf('$function$;', at);
  if (end < 0) return null;
  return src.slice(at, end + '$function$;'.length);
}

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const before = (await c.query('select count(*)::int n from members')).rows[0].n;
  console.log('\n   ' + (useOld ? 'CONTROL: the code as it was before 0051   (must FAIL)' : 'the live functions') + '\n');
  await c.query('begin');
  try {
    // ── the environment, before anything is claimed about behaviour ────────
    const idx = (await c.query(
      `select 1 from pg_indexes where schemaname='public' and indexname='members_person_circle_uniq'`)).rowCount;
    const trg = (await c.query(
      `select tgenabled from pg_trigger where tgrelid='public.members'::regclass and tgname='trg_member_identity'`)).rows[0];
    ck('[environment] the database refuses two memberships of one person in one circle', idx === 1);
    ck('[environment] the identity trigger is armed, so rows carry a person at all',
       !!trg && trg.tgenabled === 'O', trg);
    if (idx !== 1 || !trg) throw new Error('environment not as required — nothing below would be evidence');

    if (useOld) {
      const old = oldJoinViaLink();
      if (!old) throw new Error('could not read the 0025 baseline');
      await c.query(old);
    }

    const joinerId = (await c.query(
      `select id from users where id <> $1 order by created_at limit 1`, [OWNER])).rows[0].id;
    const thirdId = (await c.query(
      `select id from users where id <> $1 and id <> $2 limit 1`, [OWNER, joinerId])).rows[0].id;

    const mkCircle = async (nm) => (await c.query(
      `insert into circles (owner_id, name, domain) values ($1, $2, 'travel') returning id`,
      [OWNER, nm])).rows[0].id;
    const typed = async (circle, method, value, name) => (await c.query(
      `insert into members (owner_id, circle_id, name, contact_method, contact_value, response_rate)
       values ($1, $2, $3, $4, $5, 'unknown') returning id, person_id, linked_user_id`,
      [OWNER, circle, name, method, value])).rows[0];
    const rowsIn = async (circle) => (await c.query(
      `select name, contact_method, contact_value, trust_basis, person_id, linked_user_id
         from members where circle_id = $1 order by created_at`, [circle])).rows;

    // The WhatsApp join, as complete-join performs it. New: one RPC. Old: look
    // for a member carrying their user id, and insert when there is none —
    // the exact shape that failed.
    const waJoin = async (circle, userId, name) => {
      if (!useOld) {
        return (await c.query(`select public.join_circle_as_user($1, $2, $3) as r`,
          [circle, userId, name || null])).rows[0].r;
      }
      const found = (await c.query(
        `select id from members where circle_id = $1 and linked_user_id = $2`, [circle, userId])).rows;
      if (found.length) return { ok: true, outcome: 'already', member_id: found[0].id };
      await c.query('savepoint old_join');
      try {
        const u = (await c.query(`select name, phone, email from users where id = $1`, [userId])).rows[0];
        const r = await c.query(
          `insert into members (owner_id, circle_id, name, trust_basis, contact_method,
                                contact_value, response_rate, linked_user_id)
           values ($1, $2, $3, 'Joined via invite link', 'whatsapp', $4, 'unknown', $5)
           returning id`,
          [OWNER, circle, name || u.name || u.phone, u.phone, userId]);
        return { ok: true, outcome: 'created', member_id: r.rows[0].id };
      } catch (e) {
        await c.query('rollback to savepoint old_join');
        return { ok: false, reason: e.code + ' ' + (e.constraint || e.message) };
      }
    };

    // ── 1 · the case that broke: typed in, THEN they join ──────────────────
    // Order is the whole point. The row is written before that number belongs
    // to an account, which is why it can never carry their user id.
    console.log('\n-- someone you wrote down, joining --\n');
    let cir = await mkCircle('sim typed-by-phone');
    const t1 = await typed(cir, 'whatsapp', PHONE, 'naama');
    ck('[precondition] a row typed before they had an account is unlinked', t1.linked_user_id === null, t1);
    await c.query('update users set phone = $2 where id = $1', [joinerId, PHONE]);

    const r1 = await waJoin(cir, joinerId, 'naama');
    const after1 = await rowsIn(cir);
    ck('they get in', r1.ok === true, r1);
    ck('...by taking over the row you wrote, not a second one', r1.outcome === 'adopted', r1);
    ck('...so the circle still has exactly one of them', after1.length === 1, after1.map((x) => x.name));
    ck('...now carrying their account', after1.length === 1 && after1[0].linked_user_id === joinerId, after1[0]);
    ck('...under the name and number YOU gave them',
       after1.length === 1 && after1[0].name === 'naama' && after1[0].contact_value === PHONE, after1[0]);
    ck('...as the same person as before', after1.length === 1 && after1[0].person_id === t1.person_id);

    const r1b = await waJoin(cir, joinerId, 'naama');
    ck('pressing send twice is still one membership',
       r1b.outcome === 'already' && (await rowsIn(cir)).length === 1, r1b);

    // ── 2 · the case that always worked must keep working ──────────────────
    console.log('\n-- someone you never wrote down --\n');
    cir = await mkCircle('sim never-typed');
    const r2 = await waJoin(cir, joinerId, null);
    const after2 = await rowsIn(cir);
    ck('a stranger joining by link gets a membership', r2.outcome === 'created', r2);
    ck('...reachable, with a contact on it',
       after2.length === 1 && !!after2[0].contact_method && !!after2[0].contact_value, after2[0]);

    // ── 3 · the signed-in path, as the app calls it ────────────────────────
    console.log('\n-- the signed-in join, as role authenticated --\n');
    cir = await mkCircle('sim signed-in');
    const token = (await c.query(
      `insert into circle_invite_links (token, circle_id, owner_id)
       values (replace(gen_random_uuid()::text,'-',''), $1, $2) returning token`,
      [cir, OWNER])).rows[0].token;
    await typed(cir, 'email', EMAIL, 'Written down first');
    await c.query('update users set email = $2 where id = $1', [joinerId, EMAIL]);
    await c.query(`set local role authenticated`);
    await c.query(`set local request.jwt.claims = '{"sub":"${joinerId}","role":"authenticated"}'`);
    let viaLink;
    await c.query('savepoint via');
    try {
      viaLink = (await c.query(`select public.join_circle_via_link($1) as r`, [token])).rows[0].r;
    } catch (e) {
      viaLink = { threw: e.code + ' ' + (e.constraint || e.message) };
      await c.query('rollback to savepoint via');
    }
    await c.query('reset role');
    const after3 = await rowsIn(cir);
    ck('a signed-in member tapping the link gets in', viaLink && viaLink.joined === true, viaLink);
    ck('...by adopting the row you wrote — one row, now linked',
       after3.length === 1 && after3[0].linked_user_id === joinerId && after3[0].name === 'Written down first',
       after3.map((x) => ({ n: x.name, l: !!x.linked_user_id })));
    const uses = (await c.query(`select uses from circle_invite_links where token = $1`, [token])).rows[0].uses;
    ck('...the link records the use', uses === 1, uses);
    const notif = (await c.query(
      `select title from notifications where circle_id = $1 and type = 'invite_accepted'`, [cir])).rows;
    ck('...and YOU are told they joined', notif.length === 1 && /Written down first joined/.test(notif[0].title), notif);

    // ── 4 · what must NOT happen ───────────────────────────────────────────
    console.log('\n-- the lines it must not cross --\n');
    cir = await mkCircle('sim already-linked');
    await c.query(
      `insert into members (owner_id, circle_id, name, contact_method, contact_value, response_rate, linked_user_id)
       values ($1, $2, 'Not You', 'whatsapp', $3, 'unknown', $4)`, [OWNER, cir, PHONE, thirdId]);
    const r5 = await waJoin(cir, joinerId, null);
    ck('a membership already pointing at another account is never taken over',
       r5.ok === false && (await rowsIn(cir)).length === 1, r5);
    ck('...and the refusal is a reason, not a raw constraint name',
       r5.ok === false && r5.reason === 'contact_on_another_account', r5);

    cir = await mkCircle('sim email-typed phone-joiner');
    await typed(cir, 'email', 'someone.else.917@example.com', 'Beta Tester');
    await c.query('update users set phone = $2 where id = $1', [joinerId, PHONE]);
    const r6 = await waJoin(cir, joinerId, null);
    ck('[documented] no contact in common means a second row, never a name-merge',
       r6.outcome === 'created' && (await rowsIn(cir)).length === 2, r6);

    cir = await mkCircle('sim own-circle');
    const r7 = await waJoin(cir, OWNER, null);
    ck('the owner never becomes a member of their own circle',
       r7.ok === false && r7.reason === 'own_circle' && (await rowsIn(cir)).length === 0, r7);
  } catch (e) {
    fail++;
    console.log('  FAIL  the run threw: ' + e.message);
  } finally {
    await c.query('rollback');
  }
  const after = (await c.query('select count(*)::int n from members')).rows[0].n;
  console.log('\n  members before/after: ' + before + '/' + after + (before === after ? '  (nothing kept)' : '  !! KEPT'));
  if (before !== after) fail++;
  console.log('  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  await c.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
