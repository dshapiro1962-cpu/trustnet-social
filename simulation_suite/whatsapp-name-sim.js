// whatsapp-name-sim.js — the joiner presses send and arrives with their name.
//
// dan, 9 Sep: "why dont you take the name from the contact list... whoever
// joins should not do anything except click."
//
// The address book is unreachable: navigator.contacts.select exists only in
// Chrome on Android, which is why "Pick from contacts" never renders on an
// iPhone or a desktop. But the name was already arriving and nothing read it.
// Every inbound WhatsApp Cloud API message carries the sender's own profile
// name beside the message:
//
//     value.contacts[0].profile.name
//
// complete-join's comment says "WhatsApp does not expose a name" — true of the
// number alone, wrong about the payload, and it was believed instead of read.
// Four neighbours joined dan's Travel circle as +9725488206.. and he renamed
// every one by hand.
//
// Part A runs THE REAL record_invite_claim against production inside a
// transaction that is always rolled back. Part B checks the two functions read
// and use what it stores.
//
//   node whatsapp-name-sim.js         → must PASS
//   node whatsapp-name-sim.js --old   → the *.pre-v0.86.0.ts snapshots, must FAIL
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

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();
  const before = (await c.query('select count(*)::int n from invite_claims')).rows[0].n;

  await c.query('begin');
  try {
    console.log('\n-- record_invite_claim, against the real schema --\n');
    const tok = (await c.query(
      'select token from circle_invite_links where active = true limit 1')).rows[0].token;

    const call = async (a) => (await c.query(a.length === 3
      ? 'select public.record_invite_claim($1,$2,$3) as r'
      : 'select public.record_invite_claim($1,$2) as r', a)).rows[0].r;
    const stored = async () => (await c.query(
      'select claimed_name from invite_claims where token=$1 order by claimed_at desc limit 1',
      [tok])).rows[0].claimed_name;

    // THE DEPLOY WINDOW. The webhook running in production right now calls the
    // two-argument form. It must keep working between this migration and the
    // function deploy, which is why the old signature was kept and delegates
    // rather than being dropped.
    const r2 = await call([tok, '+972500000001']);
    ck('the OLD two-argument call still works', r2 && r2.ok === true, JSON.stringify(r2));
    ck('...and records no name rather than a wrong one', (await stored()) === null);

    await call([tok, '+972500000001', 'Rany Shapiro']);
    ck('a WhatsApp profile name is stored', (await stored()) === 'Rany Shapiro');

    // A NUMBER IS NOT A NAME. Adopting it is the exact thing this exists to
    // stop, so it is rejected at the door rather than downstream.
    await call([tok, '+972500000001', '+972500000001']);
    ck('a "name" that is really a number is discarded', (await stored()) === null);

    await call([tok, '+972500000001', '   ']);
    ck('blank is not a name', (await stored()) === null);

    await call([tok, '+972500000001', 'x'.repeat(200)]);
    const long = await stored();
    ck('an absurd name is capped, not stored whole', long && long.length === 80,
       long ? long.length + ' chars' : 'null');

    const bad = await call(['not-a-real-token', '+972500000001', 'X']);
    ck('an invalid token is still refused', bad && bad.ok === false, JSON.stringify(bad));

  } finally {
    await c.query('rollback');
  }

  console.log('\n-- the functions read it, and use it in the right order --\n');
  const wh = fs.readFileSync(useOld
    ? path.join(__dirname, 'whatsapp-webhook.pre-v0.86.0.ts')
    : path.join(REPO, 'supabase', 'functions', 'whatsapp-webhook', 'index.ts'), 'utf8');
  const cj = fs.readFileSync(useOld
    ? path.join(__dirname, 'complete-join.pre-v0.86.0.ts')
    : path.join(REPO, 'supabase', 'functions', 'complete-join', 'index.ts'), 'utf8');

  ck('the webhook reads the sender\'s profile name',
     /contacts\?\.\[0\]\?\.profile\?\.name/.test(wh),
     'it was in every payload and nothing looked at it');
  ck('...defensively, so an account without one behaves as before',
     /\?\?\s*""/.test(wh.slice(wh.indexOf('profile?.name'), wh.indexOf('profile?.name') + 120)));
  ck('...and passes it to the claim', /p_name:\s*profileName \|\| null/.test(wh));

  // RUN THE REAL EXTRACTION against the payload shapes Meta actually sends.
  // This is the line I could not confirm from logs, so it is confirmed here
  // instead: it must find the name when present and yield "" — never throw,
  // never undefined — for every shape that lacks it.
  const expr = (wh.match(/String\(\(value as any\)\?\.contacts[^;]*\)\.trim\(\);/) || [''])[0]
    .replace(/^String\(/, 'return String(').replace(/ as any/g, '');
  const read = expr ? new Function('value', expr) : null;
  ck('the extraction expression is present and runnable', !!read);
  if (read) {
    const full = { contacts: [{ profile: { name: 'Rany Shapiro' }, wa_id: '972523972011' }],
                   messages: [{ from: '972523972011' }] };
    ck('a normal inbound message yields the name', read(full) === 'Rany Shapiro');
    ck('no contacts array at all yields "" and does not throw',
       read({ messages: [{ from: '9725' }] }) === '');
    ck('a contact with no profile yields ""', read({ contacts: [{ wa_id: '9725' }] }) === '');
    ck('a profile with no name yields ""', read({ contacts: [{ profile: {} }] }) === '');
    ck('an undefined value yields ""', read(undefined) === '');
    ck('a padded name is trimmed', read(
      { contacts: [{ profile: { name: '  May  ' } }] }) === 'May');
  }

  ck('complete-join asks the claim for it', /claimed_name/.test(cj));
  // THE ORDER IS THE RULE. The inviter's own label wins — each owner keeps
  // their own name for someone — then the joiner's WhatsApp name, then the
  // number, which is what is left when nobody knows what to call them.
  ck('the inviter\'s own label still wins',
     /name: invitedName \?\? profileName \?\? \("\+" \+ e164\)/.test(cj),
     'owner label, then WhatsApp name, then the number');

  const afterC = (await c.query('select count(*)::int n from invite_claims')).rows[0].n;
  ck('NOTHING WAS KEPT — invite_claims unchanged', afterC === before,
     'before=' + before + ' after=' + afterC);

  await c.end();
  console.log('\n  ' + (useOld ? 'BASELINE v0.85.0 (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message); process.exit(1); });
