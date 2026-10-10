// ═══════════════════════════════════════════════════════════════════════════
// signin-account-sim — a WhatsApp sign-in opens the account that carries the
// number, and only the server can put a number on an account.
//
// dan, 10 Oct 2026: WhatsApp sign-in put him in an EMPTY account. His number
// is on his email account (8 circles, 124 recommendations); complete-join
// found that account by it, then minted the session for
// wa<number>@wa.trustnet.local - another address, which became an empty
// account of its own on 5 Oct.
//
// The fix has two halves and this checks both:
//   1. complete-join mints the session for the account it found, and refuses
//      when a number sits on more than one account (0057's function half)
//   2. a signed-in user cannot set or change users.phone (0057's trigger) -
//      without it, half 1 would let someone put another person's number on
//      their own account and catch that person's WhatsApp sign-ins
//
// SECTION 1 RUNS THE REAL FILE: Node 24's module.stripTypeScriptTypes, the
// whole of complete-join/index.ts in a vm, the database and auth as recorders.
// SECTION 2 runs against the REAL database as role `authenticated`, in a
// transaction that is ALWAYS rolled back. It proves the role is in force
// before it asserts anything.
//
//   node signin-account-sim.js         live, must PASS (section 2 needs 0057)
//   node signin-account-sim.js --old   fn-pre-0057/, must FAIL (exit 1).
//                                      Section 2 is skipped: the live database
//                                      cannot be put back to before 0057; the
//                                      dry run on 10 Oct showed the hole open
//                                      before the trigger and shut after it.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripTypeScriptTypes } = require('module');

const OLD = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const FILE = OLD
  ? path.join(__dirname, 'fn-pre-0057', 'complete-join.ts')
  : path.join(REPO, 'supabase', 'functions', 'complete-join', 'index.ts');
if (!stripTypeScriptTypes) { console.log('\n  SKIP: this Node cannot strip TypeScript\n'); process.exit(2); }
// core.autocrlf is true on this machine.
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const src = read(FILE);
const utils = read(path.join(REPO, 'supabase', 'functions', '_shared', 'utils.ts'));

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

// The REAL phoneKey and toE164, lifted out of _shared/utils.ts.
const lift = (name) => {
  const m = utils.match(new RegExp('export function ' + name + '\\([\\s\\S]*?\\n\\}'));
  if (!m) { console.log('\n  FATAL: ' + name + ' not found in utils.ts\n'); process.exit(2); }
  return stripTypeScriptTypes(m[0].replace(/^export /, ''));
};
const helpers = lift('phoneKey') + '\n' + lift('toE164');

// ── the world complete-join talks to ───────────────────────────────────────
// users: rows of public.users. authUsers: id -> email in auth.users.
function load(world) {
  const log = { sessionFor: null, created: [], consumed: false, joined: false };
  const result = (table, op, filters) => {
    if (table === 'invite_claims' && op === 'select') {
      return { data: { id: 'claim1', token: world.token, claimed_phone: world.phone, claimed_name: 'Dan',
        consumed_at: null, expires_at: new Date(Date.now() + 600000).toISOString() }, error: null };
    }
    if (table === 'invite_claims' && op === 'update') { log.consumed = true; return { data: null, error: null }; }
    if (table === 'circle_invite_links') return { data: null, error: null };   // a sign-in, not an invite
    if (table === 'users' && op === 'select') return { data: world.users.filter((u) => u.phone), error: null };
    if (table === 'users' && op === 'insert') return { data: null, error: null };
    return { data: null, error: null };
  };
  const builder = (table) => {
    let op = 'select';
    const filters = [];
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res) => res(result(table, op, filters));
        if (k === 'maybeSingle' || k === 'single') return async () => result(table, op, filters);
        return (...a) => {
          if (/^(insert|update|upsert|delete)$/.test(String(k))) op = String(k);
          filters.push([String(k), a]);
          if (k === 'insert') { log.created.push(a[0]); }
          return p;
        };
      },
    });
    return p;
  };
  const admin = {
    from: (t) => builder(t),
    rpc: async (name) => {
      if (name === 'is_live_signin_token') return { data: true, error: null };
      if (name === 'consume_signin_token') return { data: true, error: null };
      if (name === 'join_circle_as_user') { log.joined = true; return { data: { ok: true, outcome: 'adopted' }, error: null }; }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id) => world.authUsers[id]
          ? { data: { user: { id, email: world.authUsers[id] } }, error: null }
          : { data: { user: null }, error: { message: 'User not found' } },
        createUser: async ({ email }) => {
          const id = 'new-' + Object.keys(world.authUsers).length;
          world.authUsers[id] = email;
          return { data: { user: { id, email } }, error: null };
        },
        generateLink: async ({ email }) => {
          log.sessionFor = email;
          // generateLink makes the auth user if there is none - which is how
          // the empty account came to exist on 5 Oct.
          if (!Object.values(world.authUsers).includes(email)) world.authUsers['made-by-link'] = email;
          return { data: { properties: { hashed_token: 'h:' + email } }, error: null };
        },
      },
      verifyOtp: async ({ token_hash }) => ({ data: { session: {
        access_token: 'session-for:' + token_hash.slice(2), refresh_token: 'r' } }, error: null }),
    },
  };
  let handler = null;
  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    Deno: { serve: (h) => { handler = h; }, env: { get: () => undefined } },
    Request, Response, Headers, URL, JSON, Date, Math,
    adminClient: () => admin,
    json: (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { 'content-type': 'application/json' } }),
    err: (m, s) => new Response(JSON.stringify({ error: m }), { status: s || 400, headers: { 'content-type': 'application/json' } }),
    handleOptions: () => null,
  };
  vm.runInNewContext(helpers + '\n' + stripTypeScriptTypes(src.replace(/^import [^\n]*\n/gm, '')), ctx,
    { filename: path.basename(FILE) });
  if (!handler) throw new Error('Deno.serve was never called');
  return { handler, log };
}
const signIn = (handler, phone) => handler(new Request('https://x/functions/v1/complete-join', {
  method: 'POST', body: JSON.stringify({ token: 'tok', phone }) }));

(async () => {
  console.log('\n── 1 · which account a WhatsApp sign-in opens ── '
    + (OLD ? 'BASELINE fn-pre-0057 (must FAIL)' : 'live file') + ' ──\n');

  // A · dan: his number is on his EMAIL account
  {
    const world = { token: 'tok', phone: '+972505543402',
      users: [{ id: 'dan', name: 'dan', phone: '972505543402' }],
      authUsers: { dan: 'dan@example.com' } };
    const { handler, log } = load(world);
    const r = await signIn(handler, '+972505543402');
    const body = await r.json();
    ck('A · a number on an email account opens THAT account',
       r.status === 200 && log.sessionFor === 'dan@example.com',
       'session minted for ' + log.sessionFor);
    ck('A · ...and no second account is made', log.created.length === 0
       && !Object.prototype.hasOwnProperty.call(world.authUsers, 'made-by-link'),
       'made: ' + JSON.stringify(Object.values(world.authUsers)));
  }
  // B · a number nobody has: a new WhatsApp account, as before
  {
    const world = { token: 'tok', phone: '+972500000009', users: [], authUsers: {} };
    const { handler, log } = load(world);
    const r = await signIn(handler, '+972500000009');
    ck('B · a new number still makes a WhatsApp account and opens it',
       r.status === 200 && log.created.length === 1 && log.sessionFor === 'wa500000009@wa.trustnet.local',
       'session for ' + log.sessionFor);
  }
  // C · an account WhatsApp made earlier: unchanged
  {
    const world = { token: 'tok', phone: '+972541110000',
      users: [{ id: 'w1', name: 'Maya', phone: '+972541110000' }],
      authUsers: { w1: 'wa541110000@wa.trustnet.local' } };
    const { handler, log } = load(world);
    const r = await signIn(handler, '+972541110000');
    ck('C · an account WhatsApp made opens as before',
       r.status === 200 && log.sessionFor === 'wa541110000@wa.trustnet.local' && log.created.length === 0);
  }
  // D · one number on two accounts: refuse, open nothing, spend nothing
  {
    const world = { token: 'tok', phone: '+972505543402',
      users: [{ id: 'a', name: 'a', phone: '972505543402' }, { id: 'b', name: 'b', phone: '+972 50-554-3402' }],
      authUsers: { a: 'a@example.com', b: 'b@example.com' } };
    const { handler, log } = load(world);
    const r = await signIn(handler, '+972505543402');
    const body = await r.json().catch(() => ({}));
    ck('D · a number on TWO accounts is refused, not guessed',
       r.status === 409 && body.error === 'phone_on_several_accounts', 'status ' + r.status + ' ' + JSON.stringify(body));
    ck('D · ...and no session is minted, no claim spent', log.sessionFor === null && !log.consumed,
       'session for ' + log.sessionFor + ', consumed ' + log.consumed);
  }

  // ── 2 · THE TRIGGER, on the real database ─────────────────────────────────
  const envPath = path.join(REPO, '.env.local');
  const m0 = fs.existsSync(envPath) ? read(envPath).match(/^TRUSTNET_DB_URL\s*=\s*(.+)$/m) : null;
  if (OLD) {
    console.log('\n  (section 2 skipped under --old: the live database cannot be put back to before 0057)');
  } else if (!m0) {
    console.log('\n  (no TRUSTNET_DB_URL — section 2 skipped)');
  } else {
    console.log('\n── 2 · only the server can put a number on an account (real database, rolled back) ──\n');
    const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));
    const c = new Client({ connectionString: m0[1].trim(), ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query('begin');
    try {
      const armed = (await c.query(`select count(*)::int n from pg_trigger
        where tgrelid = 'public.users'::regclass and tgname = 'trg_users_phone_server_only' and tgenabled <> 'D'`)).rows[0].n;
      ck('the trigger is on public.users and armed', armed === 1, 'apply 0057 first');
      const me = (await c.query(`select id, phone from public.users where phone is not null limit 1`)).rows[0];
      const other = (await c.query(`select id from public.users where id <> $1 limit 1`, [me.id])).rows[0];
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, true)", [me.id]);
      // Prove the environment first: RLS must refuse a write to someone else's row.
      const foreign = await c.query(`update public.users set name = name where id = $1`, [other.id]);
      ck('the role is in force: another account’s row cannot be touched', foreign.rowCount === 0,
         'rowCount ' + foreign.rowCount + ' - RLS is not on, nothing below is evidence');
      await c.query('savepoint s1');
      let refused = null;
      try { await c.query(`update public.users set phone = '+972500000001' where id = $1`, [me.id]); refused = false; }
      catch (e) { refused = e.code === '42501'; await c.query('rollback to savepoint s1'); }
      ck('a signed-in user CANNOT change the number on their own account', refused === true);
      await c.query('savepoint s2');
      let cleared = null;
      try { await c.query(`update public.users set phone = null where id = $1`, [me.id]); cleared = false; }
      catch (e) { cleared = e.code === '42501'; await c.query('rollback to savepoint s2'); }
      ck('...nor remove it', cleared === true);
      const named = await c.query(`update public.users set name = name where id = $1`, [me.id]);
      ck('...while saving the rest of their profile still works', named.rowCount === 1);
      await c.query('reset role');
      const server = await c.query(`update public.users set phone = phone where id = $1`, [me.id]);
      ck('the server (not `authenticated`) can still write it', server.rowCount === 1);
    } finally {
      await c.query('rollback');
      await c.end();
    }
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — the baseline opens the wrong account, so the checks above measure the fix.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
