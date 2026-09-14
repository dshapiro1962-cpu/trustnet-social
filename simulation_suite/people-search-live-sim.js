// people-search-live-sim.js — one identity, many names, against the REAL
// database with RLS on, in a transaction that is always rolled back.
//
// THE RULE, as dan stated it on 14 Sep 2026:
//
//   The definitive identifier is the phone number or the email. It does not
//   matter that one user calls him "uncle", another "dan" and another
//   "shapiro". The database knows they are the same person because they share
//   the contact. But when a user types "uncle", THEIR person comes up, because
//   that is the name THEY attached to that phone number.
//
// WHAT WAS BROKEN. search_my_people matched and returned people.name - one
// GLOBAL name, written by the member_identity trigger at first sighting and
// never revisited. Three of dan's thirteen people had a PHONE NUMBER there, so
// searching "tal shapiro" found nothing although she is in two of his circles,
// and the picker listed "+972523384665" instead of a name.
//
// THE SIM BUILDS DAN'S OWN EXAMPLE. Two owners, one phone number, two labels:
//   owner A calls +972500000001 "uncle"
//   owner B calls the same number "dan"
// Then it asserts, as each owner in turn under RLS:
//   - "uncle" finds the person for A and NOT for B
//   - "dan"   finds the person for B and NOT for A
//   - both see the SAME person_id, because it is the same phone number
//   - each sees THEIR OWN label, never the other's
//
// It then runs the REAL failing case - Tal Shapiro, whose person row really is
// named "+972523384665" in production - and requires the search to find her.
//
// NOTHING IS KEPT. The rollback is in `finally` and the counts are asserted
// afterwards.
//
//   node people-search-live-sim.js         → must PASS
//   node people-search-live-sim.js --old   → restores the pre-0041 function
//                                            inside the transaction, must FAIL
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
const m0 = fs.readFileSync(envPath, 'utf8').match(/^TRUSTNET_DB_URL\s*=\s*(.+)$/m);
if (!m0) { console.error('TRUSTNET_DB_URL not found in .env.local'); process.exit(2); }
const url = m0[1].trim();

const MIGRATION = path.join(REPO, 'supabase', 'migrations', '0041_search_my_people_own_label.sql');
const DAN = 'c7af8222-f595-455b-83d4-d848a8bd621a';

// The pre-0041 body, restored inside the transaction for the control. It is the
// definition that was live on 14 Sep, matching and returning people.name.
const OLD_FN = `
create or replace function public.search_my_people(p_q text)
 returns table(person_id uuid, name text, on_trustnet boolean, contacts jsonb, circles jsonb)
 language sql stable security definer set search_path to 'public'
as $fn$
  select p.id, p.name,
         (p.linked_user_id is not null) as on_trustnet,
         coalesce((select jsonb_agg(jsonb_build_object('method', pc.method, 'value', pc.value) order by pc.method)
                   from public.person_contacts pc where pc.person_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                   from public.members m join public.circles c on c.id = m.circle_id
                   where m.person_id = p.id and m.owner_id = auth.uid()), '[]'::jsonb)
  from public.people p
  where exists (select 1 from public.members m2 where m2.person_id = p.id and m2.owner_id = auth.uid())
    and (p_q is null or btrim(p_q) = '' or p.name ilike '%' || btrim(p_q) || '%')
  order by p.name limit 25;
$fn$;`;

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  const before = (await c.query('select count(*)::int n from people')).rows[0].n;
  const beforeM = (await c.query('select count(*)::int n from members')).rows[0].n;

  console.log('\n   ' + (useOld ? 'CONTROL: the pre-0041 function' : 'PATCHED: migration 0041')
    + '\n');

  await c.query('begin');
  try {
    // Install whichever version is under test, inside the transaction.
    if (useOld) await c.query(OLD_FN);
    else await c.query(fs.readFileSync(MIGRATION, 'utf8'));

    // ── the two owners, one phone number ─────────────────────────────────
    const PHONE = '+972500000001';
    // TWO REAL ACCOUNTS AS THE TWO OWNERS. users.id is foreign-keyed to
    // auth.users, so inventing owners would mean writing to the auth schema.
    // Two accounts that already exist prove the same thing and touch less.
    const A = DAN;
    const B = (await c.query(
      `select id from users where id <> $1 and id in (select owner_id from circles)
        order by created_at limit 1`, [DAN])).rows[0].id;
    const cA = (await c.query(
      `insert into circles (owner_id, name, domain) values ($1,'A circle','other') returning id`, [A])).rows[0].id;
    const cB = (await c.query(
      `insert into circles (owner_id, name, domain) values ($1,'B circle','other') returning id`, [B])).rows[0].id;

    // Owner A calls that number "uncle". Owner B calls it "dan".
    const mA = (await c.query(
      `insert into members (circle_id, owner_id, name, contact_method, contact_value)
       values ($1,$2,'uncle','whatsapp',$3) returning id, person_id`, [cA, A, PHONE])).rows[0];
    const mB = (await c.query(
      `insert into members (circle_id, owner_id, name, contact_method, contact_value)
       values ($1,$2,'dan','whatsapp',$3) returning id, person_id`, [cB, B, PHONE])).rows[0];

    console.log('   owner A calls ' + PHONE + ' "uncle"');
    console.log('   owner B calls ' + PHONE + ' "dan"\n');

    // ── IDENTITY: same contact, same person ──────────────────────────────
    console.log('== identity: the phone number is the identifier ==\n');
    ck('both member rows resolved to a person', !!mA.person_id && !!mB.person_id);
    ck('and it is THE SAME person, because the phone number is the same',
       mA.person_id === mB.person_id,
       'A=' + mA.person_id + '  B=' + mB.person_id);
    const globalName = (await c.query('select name from people where id=$1', [mA.person_id])).rows[0].name;
    console.log('        people.name (the internal one) = "' + globalName + '"\n');

    // ── SEARCH, as each owner under RLS ─────────────────────────────────
    const asOwner = async (uid, q) => {
      await c.query('savepoint s');
      await c.query('set local role authenticated');
      await c.query(
        "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
        [uid]);
      const r = (await c.query('select person_id, name from public.search_my_people($1)', [q])).rows;
      await c.query('reset role');
      await c.query('release savepoint s');
      return r;
    };

    console.log('== search: each owner finds their own label ==\n');

    const aUncle = await asOwner(A, 'uncle');
    ck('A searches "uncle" and finds them', aUncle.length === 1,
       'got ' + aUncle.length + ' result(s)');
    ck('...shown under A\'s own label, "uncle"',
       aUncle.length === 1 && aUncle[0].name === 'uncle',
       'got ' + JSON.stringify(aUncle.map((x) => x.name)));

    const bDan = await asOwner(B, 'dan');
    const bHit = bDan.filter((x) => x.person_id === mB.person_id);
    ck('B searches "dan" and finds them', bHit.length === 1,
       'got ' + bHit.length + ' matching result(s)');
    ck('...shown under B\'s own label, "dan"',
       bHit.length === 1 && bHit[0].name === 'dan',
       'got ' + JSON.stringify(bHit.map((x) => x.name)));

    ck('THE SAME person_id for both, from two different searches',
       aUncle.length === 1 && bHit.length === 1
       && aUncle[0].person_id === bHit[0].person_id);

    console.log('\n== and one owner\'s label is invisible to the other ==\n');
    const aDan = await asOwner(A, 'dan');
    ck('A searching "dan" does NOT find them — that is B\'s word, not A\'s',
       aDan.filter((x) => x.person_id === mA.person_id).length === 0,
       'A saw ' + JSON.stringify(aDan.map((x) => x.name)));
    const bUncle = await asOwner(B, 'uncle');
    ck('B searching "uncle" does NOT find them — that is A\'s word',
       bUncle.filter((x) => x.person_id === mB.person_id).length === 0,
       'B saw ' + JSON.stringify(bUncle.map((x) => x.name)));

    // ── THE REAL CASE dan REPORTED ──────────────────────────────────────
    console.log('\n== the case dan reported, on his real rows ==\n');
    const tal = await asOwner(DAN, 'tal shapiro');
    ck('dan searches "tal shapiro" and finds her',
       tal.length >= 1, 'got ' + tal.length + ' result(s) — she is in dining and Travel');
    ck('...under the name HE gave her, not her phone number',
       tal.length >= 1 && /tal shapiro/i.test(tal[0].name),
       'got ' + JSON.stringify(tal.map((x) => x.name)));

    const all = await asOwner(DAN, '');
    const phoneNamed = all.filter((x) => /^[+0-9][0-9 ()-]{6,}$/.test(x.name));
    ck('and NO row in his picker is shown as a bare phone number',
       phoneNamed.length === 0,
       'still phone-named: ' + JSON.stringify(phoneNamed.map((x) => x.name)));
    console.log('        dan\'s picker now reads: ' + all.map((x) => x.name).join(', ') + '\n');

  } finally {
    await c.query('rollback');
  }

  console.log('== the rollback ==\n');
  const after = (await c.query('select count(*)::int n from people')).rows[0].n;
  const afterM = (await c.query('select count(*)::int n from members')).rows[0].n;
  ck('NOTHING WAS KEPT — people unchanged', after === before,
     'before=' + before + ' after=' + after);
  ck('...and members unchanged', afterM === beforeM,
     'before=' + beforeM + ' after=' + afterM);
  const stray = (await c.query(
    "select count(*)::int n from circles where name in ('A circle','B circle')")).rows[0].n;
  ck('...and no simulated circle survives', stray === 0, 'found=' + stray);
  // The function definition is transactional too - prove the live one is intact.
  const liveDef = (await c.query(
    `select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='search_my_people'`)).rows[0].d;
  ck('...and the live function was not left as the test version',
     liveDef.indexOf('$fn$') < 0, 'the control body leaked out of the transaction');

  await c.end();
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message + '\n'); process.exit(1); });
