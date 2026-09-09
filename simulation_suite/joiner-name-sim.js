// joiner-name-sim.js — a WhatsApp joiner arrives with a name of their own.
//
// THE FAILURE, dan's inbox 9 Sep 2026. Four neighbours joined the Travel
// circle in three hours and every one arrived as a phone number:
//
//     +972548820630 joined your Travel circle
//     +972528640029 joined your Travel circle
//     +972523972011 joined your Travel circle
//
// dan renamed each by hand. "what we need is the real fix."
//
// WHY IT CANNOT BE FIXED WHERE IT HAPPENS. complete-join already looks for a
// member row the inviter wrote earlier and adopts that name. The code is
// correct and it finds nothing, for two separate reasons:
//
//   timing    the member row is created by the join itself, ~1s LATER
//             (measured: account 15:36:51.42 -> member row 15:36:52.62)
//   substance for a genuine stranger there is no earlier row at all
//
// At the moment somebody joins, nobody knows their name. The only person who
// does is them — so they are asked, and 0049 carries the answer out to the
// circles they are already in, which they cannot write themselves because
// those rows belong to whoever invited them.
//
// Part A runs the REAL adopt_my_name() against the live database inside a
// transaction that is always rolled back. Part B checks the client asks.
//
//   node joiner-name-sim.js         → must PASS
//   node joiner-name-sim.js --old   → index.pre-v0.85.0.html, must FAIL
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
const url = fs.readFileSync(envPath, 'utf8').match(/TRUSTNET_DB_URL\s*=\s*(.+)/)[1].trim();

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const DAN = 'c7af8222-f595-455b-83d4-d848a8bd621a';
const PLACEHOLDER = "^\\+?[0-9][0-9 ()\\-]*$";

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();
  const beforeM = (await c.query('select count(*)::int n from members')).rows[0].n;

  await c.query('begin');
  try {
    console.log('\n-- adopt_my_name(), against the real rows --\n');

    const u = (await c.query(
      "select id, name from users where name ~ '" + PLACEHOLDER + "' order by created_at desc limit 1")).rows[0];
    ck('there is a joiner still named by their number to test with', !!u,
       u ? u.name : 'none found — the fixture the bug produced');
    if (!u) throw new Error('no placeholder-named account');

    const circle = (await c.query(
      'select id from circles where owner_id=$1 limit 1', [DAN])).rows[0].id;
    const mid = (await c.query(
      `insert into members (id, owner_id, circle_id, name, contact_method, contact_value,
         trust_basis, response_rate, avatar_color, linked_user_id)
       values (gen_random_uuid(), $1, $2, $3, 'whatsapp', $3, '', 'medium', '#217A4B', $4)
       returning id`, [DAN, circle, u.name, u.id])).rows[0].id;

    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: u.id })]);

    // A PLACEHOLDER MUST NEVER PROPAGATE. Writing the number everywhere would
    // cement the very thing this exists to remove.
    const n0 = (await c.query('select public.adopt_my_name() as n')).rows[0].n;
    ck('while they are still named by their number, nothing is written', n0 === 0,
       'renamed=' + n0);

    await c.query('update users set name = $1 where id = $2', ['נועה ברקת', u.id]);
    const n1 = (await c.query('select public.adopt_my_name() as n')).rows[0].n;
    ck('once they set a real name it reaches the circles they are in', n1 >= 1,
       'renamed=' + n1);
    const now = (await c.query('select name from members where id=$1', [mid])).rows[0].name;
    ck('...and the member row carries it', now === 'נועה ברקת', 'name=' + now);

    // THE RULE THAT MATTERS MOST: a label a human typed is that owner's own.
    const typed = (await c.query(
      "select count(*)::int n from members where owner_id=$1 and name in ('may shapiro','Rany Shapiro')",
      [DAN])).rows[0].n;
    ck('a name someone typed by hand is never overwritten', typed === 2,
       'dan renamed these two himself; found ' + typed);

    const leaked = (await c.query(
      'select count(*)::int n from members where linked_user_id is distinct from $1 and name=$2',
      [u.id, 'נועה ברקת'])).rows[0].n;
    ck('it never reaches a row belonging to somebody else', leaked === 0, 'leaked=' + leaked);

    // AN UNAUTHENTICATED CALLER GETS NOTHING. The function is SECURITY DEFINER
    // and therefore bypasses RLS; the auth.uid() guard is all that stands there.
    await c.query("select set_config('request.jwt.claims', '', true)");
    let raised = false;
    try { await c.query('select public.adopt_my_name()'); } catch (e) { raised = true; }
    ck('an unauthenticated caller is refused, not silently ignored', raised);

  } finally {
    await c.query('rollback');
  }

  console.log('\n-- the client asks, and only the right people --\n');
  const html = fs.readFileSync(useOld
    ? path.join(__dirname, 'index.pre-v0.85.0.html')
    : path.join(REPO, 'web', 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');

  ck('a phone-shaped profile name counts as not-yet-named',
     /_placeholder = \/\^\\\+\?\[0-9\]\[0-9 \(\)\\-\]\*\$\/\.test\(_pname\)/.test(src),
     'the same test complete-join uses, so there is one rule not two');
  ck('...and that is what opens the name screen',
     /_needsName[\s\S]{0,120}_placeholder && _joined >= NAME_PROMPT_FROM/.test(src));
  ck('the cutoff exists, so nobody already named is interrupted',
     /const NAME_PROMPT_FROM = Date\.parse\('20/.test(src),
     "dan's call: scope it to accounts after the deploy");
  ck('setting the name carries it out to the circles',
     /sb\.rpc\('adopt_my_name'\)/.test(src));
  ck('...after the profile is saved, not before',
     src.indexOf("sb.rpc('adopt_my_name')") > src.indexOf('await saveProfile();'),
     'the function reads users.name, so the name must be written first');

  // REGRESSION: someone with a real name must never see this screen.
  ck('[regression] a profile with a real name still goes straight to the app',
     !/^\+?[0-9][0-9 ()\-]*$/.test('dan'));

  const afterM = (await c.query('select count(*)::int n from members')).rows[0].n;
  ck('NOTHING WAS KEPT — members unchanged', afterM === beforeM,
     'before=' + beforeM + ' after=' + afterM);

  await c.end();
  console.log('\n  ' + (useOld ? 'BASELINE v0.84.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message); process.exit(1); });
