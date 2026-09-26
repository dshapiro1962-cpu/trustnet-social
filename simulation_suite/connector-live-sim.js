// ═══════════════════════════════════════════════════════════════════════════
// connector-live-sim — 0053 against the REAL database, always rolled back.
//
// connector-guards-sim.js reads source and cannot execute it: there is no Deno
// here. This is the other half — what the SQL actually does when it runs, as
// the roles that will really call it.
//
// IT PROVES THE ENVIRONMENT BEFORE IT CLAIMS ANYTHING. The role switch is
// verified by requiring a foreign-owner insert to be REFUSED. If that insert
// succeeds, RLS is not in force and nothing below it would be evidence — the
// whole reason identity_guards.sql could pass while saving was broken.
//
// WHAT IT CHECKS, all of which connector-guards-sim can only look at:
//   · a minted token resolves to its owner, and only via the hash
//   · a REVOKED token resolves to nobody
//   · the confirm view returns names and no contact details
//   · the claim is single use — two presses send one message
//   · an expired or discarded draft cannot be claimed
//   · a member cannot read another member's tokens
//
// Every write happens inside one transaction that is ALWAYS rolled back, and
// the rollback is verified at the end by counting rows.
//
//   node connector-live-sim.js         → must PASS
//   node connector-live-sim.js --old   → runs the pre-0053 path, must FAIL
//
// Exits 2, cleanly, if 0053 has not been applied yet.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const REPO = path.join(__dirname, '..');
const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));

const useOld = process.argv.indexOf('--old') > -1;
const envPath = path.join(REPO, '.env.local');
if (!fs.existsSync(envPath)) { console.error('no .env.local — this sim needs TRUSTNET_DB_URL.'); process.exit(2); }
const m0 = fs.readFileSync(envPath, 'utf8').match(/TRUSTNET_DB_URL\s*=\s*(.+)/);
if (!m0) { console.error('TRUSTNET_DB_URL not found in .env.local'); process.exit(2); }

const UID = 'c7af8222-f595-455b-83d4-d848a8bd621a';   // dan
const STRAY = 'zz-connector-live-sim';                 // findable if it ever leaks

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

(async () => {
  const c = new Client({ connectionString: m0[1].trim(), ssl: { rejectUnauthorized: false },
                         connectionTimeoutMillis: 20000 });
  await c.connect();

  // ── is 0053 even applied? ────────────────────────────────────────────────
  const have = (await c.query(
    "select count(*)::int n from information_schema.tables "
    + "where table_schema='public' and table_name in ('connector_tokens','connector_drafts')")).rows[0].n;
  if (have < 2) {
    console.log('\n  0053 is not applied yet (' + have + ' of 2 tables). Nothing to measure.');
    console.log('  Run migrations/0053_a_connector_asks_before_it_sends.sql first.\n');
    await c.end();
    process.exit(2);
  }

  console.log('\n── connector, live ── ' + (useOld ? 'CONTROL' : 'patched') + ' ──\n');
  await c.query('begin');

  try {
    // ── 0 · PROVE THE ENVIRONMENT ─────────────────────────────────────────
    console.log('  the environment:');
    await c.query('set local role authenticated');
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
      [UID]);

    const whoami = (await c.query('select auth.uid() as u, current_user as r')).rows[0];
    ck('running as authenticated, as dan', whoami.r === 'authenticated' && whoami.u === UID,
       whoami.r + ' / ' + whoami.u);

    // THE LOAD-BEARING CHECK. A foreign-owner insert must be refused, or RLS
    // is off and every assertion after this is worthless.
    let refused = false;
    await c.query('savepoint fo');
    try {
      await c.query(
        "insert into public.circles (owner_id, name, domain) values "
        + "('00000000-0000-0000-0000-000000000001', $1, 'other')", [STRAY]);
      await c.query('rollback to savepoint fo');
    } catch (e) {
      refused = true;
      await c.query('rollback to savepoint fo');
    }
    ck('a foreign-owner insert is REFUSED — RLS is really on', refused);
    if (!refused) throw new Error('RLS not in force; refusing to report anything else');

    // ── 1 · minting ───────────────────────────────────────────────────────
    console.log('\n  the token:');
    const minted = useOld
      ? null
      : (await c.query("select public.mint_connector_token('sim') as t")).rows[0].t;
    // The control also proves the pre-0054 door is shut: a two-argument claim
    // was all the confirm token needed, and it must no longer exist.
    const twoArg = (await c.query(
      "select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
      "where n.nspname = 'public' and p.proname = 'connector_draft_claim' " +
      "and pg_get_function_identity_arguments(p.oid) = 'text, text'")).rows[0].n;
    ck('the two-argument claim no longer exists in the database', twoArg === 0, 'found ' + twoArg);

    ck('a token is minted for the signed-in member', !!minted && minted.length >= 40,
       minted ? minted.length + ' chars' : 'none');

    // The row must hold the HASH and never the token.
    await c.query('set local role postgres');
    const row = minted
      ? (await c.query('select owner_id, token_hash, label from public.connector_tokens where token_hash = $1',
          [sha256(minted)])).rows[0]
      : null;
    ck('the row stores the sha256, and the plaintext appears nowhere', !!row,
       row ? 'found by hash' : 'not found by hash');
    ck('...and it belongs to the member who minted it', !!row && row.owner_id === UID);

    const plainHit = minted
      ? (await c.query('select count(*)::int n from public.connector_tokens where token_hash = $1', [minted])).rows[0].n
      : 1;
    ck('the plaintext is NOT what is stored', plainHit === 0, 'rows matching plaintext: ' + plainHit);

    // ── 2 · resolving, and revoking ───────────────────────────────────────
    const owner = minted
      ? (await c.query('select public.connector_owner($1) as o', [sha256(minted)])).rows[0].o
      : null;
    ck('connector_owner resolves the hash to the member', owner === UID, String(owner));

    const bogus = (await c.query('select public.connector_owner($1) as o', [sha256('not-a-real-token')])).rows[0].o;
    ck('an unknown token resolves to nobody', bogus === null, String(bogus));

    if (minted) {
      await c.query('update public.connector_tokens set revoked_at = now() where token_hash = $1', [sha256(minted)]);
      const after = (await c.query('select public.connector_owner($1) as o', [sha256(minted)])).rows[0].o;
      ck('a REVOKED token resolves to nobody', after === null, String(after));
    } else {
      ck('a REVOKED token resolves to nobody', false, 'no token to revoke');
    }

    // ── 3 · the draft, and what the confirm page may know ─────────────────
    console.log('\n  the draft:');
    const circle = (await c.query(
      'select id, name from public.circles where owner_id = $1 order by created_at limit 1', [UID])).rows[0];
    ck('dan has a circle to draft against', !!circle, circle ? circle.name : 'none');

    const ct = 'zzsim' + crypto.randomBytes(16).toString('hex');
    await c.query(
      'insert into public.connector_drafts (owner_id, circle_id, text, confirm_token) values ($1,$2,$3,$4)',
      [UID, circle.id, STRAY + ' question', ct]);

    const view = (await c.query('select public.connector_draft_view($1) as v', [ct])).rows[0].v;
    ck('the confirm view says it is ready', view && view.state === 'ready', JSON.stringify(view && view.state));
    ck('...and names the circle', view && view.circle === circle.name);
    ck('...and lists recipients by NAME', view && Array.isArray(view.recipients));

    // The promise made in writing on /connect, in the privacy policy and in
    // the access requirements given to Meta. This is where it would leak.
    const asText = JSON.stringify(view || {});
    const numbers = (await c.query(
      "select contact_value from public.members where circle_id = $1 and contact_value is not null", [circle.id])).rows;
    const leaked = numbers.filter((r) => asText.indexOf(r.contact_value) >= 0);
    ck('NO phone number or email of any member appears in the view',
       leaked.length === 0, leaked.length ? leaked.length + ' leaked' : '');

    // ── 4 · one press, one send ───────────────────────────────────────────
    console.log('\n  the single-use gate:');
    // ── 0054: THE PRESS MUST BE THE MEMBER ──────────────────────────────
    // draft_question hands the confirm_url to the connector, so before 0054
    // holding a connector token was enough to draft AND send. The wrong member
    // must be refused, and refused BEFORE the single use is burned.
    const stranger = (await c.query(
      'select public.connector_draft_claim($1, null, $2) as r',
      [ct, '00000000-0000-0000-0000-000000000009'])).rows[0].r;
    ck('a DIFFERENT member cannot claim the draft',
       stranger && stranger.claimed === false, JSON.stringify(stranger));

    const nobody = (await c.query('select public.connector_draft_claim($1, null, null) as r', [ct])).rows[0].r;
    ck('...and neither can nobody at all',
       nobody && nobody.claimed === false, JSON.stringify(nobody));

    const stillThere = (await c.query('select public.connector_draft_view($1) as v', [ct])).rows[0].v;
    ck('...and the refusals did NOT burn the single use',
       stillThere && stillThere.state === 'ready', JSON.stringify(stillThere && stillThere.state));

    const first = (await c.query('select public.connector_draft_claim($1, null, $2) as r', [ct, UID])).rows[0].r;
    ck('the owner’s claim succeeds', first && first.claimed === true, JSON.stringify(first && first.claimed));
    ck('...and carries what is needed to send', first && first.owner_id === UID && !!first.circle_id);

    const second = (await c.query('select public.connector_draft_claim($1, null, $2) as r', [ct, UID])).rows[0].r;
    ck('THE SECOND CLAIM FAILS — two presses send one message',
       second && second.claimed === false, JSON.stringify(second && second.claimed));

    const after = (await c.query('select public.connector_draft_view($1) as v', [ct])).rows[0].v;
    ck('and the page then says it was already sent', after && after.state === 'already_sent',
       JSON.stringify(after && after.state));

    // ── 5 · expiry and discard ────────────────────────────────────────────
    const ct2 = 'zzsim' + crypto.randomBytes(16).toString('hex');
    await c.query(
      "insert into public.connector_drafts (owner_id, circle_id, text, confirm_token, expires_at) "
      + "values ($1,$2,$3,$4, now() - interval '1 minute')",
      [UID, circle.id, STRAY + ' expired', ct2]);
    const expired = (await c.query('select public.connector_draft_claim($1, null, $2) as r', [ct2, UID])).rows[0].r;
    ck('an EXPIRED draft cannot be claimed', expired && expired.claimed === false);
    const expView = (await c.query('select public.connector_draft_view($1) as v', [ct2])).rows[0].v;
    ck('...and the page says so', expView && expView.state === 'expired', JSON.stringify(expView && expView.state));

    const ct3 = 'zzsim' + crypto.randomBytes(16).toString('hex');
    await c.query('insert into public.connector_drafts (owner_id, circle_id, text, confirm_token) values ($1,$2,$3,$4)',
      [UID, circle.id, STRAY + ' discarded', ct3]);
    await c.query('select public.connector_draft_discard($1, $2)', [ct3, UID]);
    const disc = (await c.query('select public.connector_draft_claim($1, null, $2) as r', [ct3, UID])).rows[0].r;
    ck('a DISCARDED draft cannot be claimed either', disc && disc.claimed === false);

    // ── 6 · one member cannot see another's tokens ────────────────────────
    console.log('\n  isolation:');
    await c.query('set local role authenticated');
    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
      ['00000000-0000-0000-0000-000000000002']);
    // RLS FILTERS, IT DOES NOT RAISE. Asserting "no error" here would pass for
    // the wrong reason, so this asserts the ROW COUNT.
    const seen = (await c.query('select count(*)::int n from public.connector_tokens')).rows[0].n;
    ck('a different member sees NONE of dan’s tokens', seen === 0, 'saw ' + seen);

    await c.query(
      "select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)",
      [UID]);
    const mine = (await c.query('select count(*)::int n from public.connector_tokens')).rows[0].n;
    ck('...while dan sees his own, so the count above is not an empty table', mine >= 1, 'saw ' + mine);

  } finally {
    await c.query('rollback');
  }

  // ── nothing survives ──────────────────────────────────────────────────────
  await c.query('set role postgres');
  const left = (await c.query(
    "select (select count(*) from public.connector_drafts where text like $1)::int "
    + "+ (select count(*) from public.connector_tokens where label = 'sim')::int as n", [STRAY + '%'])).rows[0].n;
  ck('\nrolled back — nothing this sim wrote is still there', left === 0, 'left ' + left);
  await c.end();

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (useOld) {
    console.log(fail > 0
      ? '  CONTROL OK — without mint_connector_token the checks fail.\n'
      : '  CONTROL BROKEN — these checks measure nothing.\n');
    process.exit(fail > 0 ? 0 : 1);
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  FATAL ' + e.message + '\n'); process.exit(1); });
