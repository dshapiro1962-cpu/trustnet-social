// ═══════════════════════════════════════════════════════════════════════════
// webhook-signature-sim — a message the webhook acts on must have come from
// Meta.
//
// FOUND 7 Oct 2026. whatsapp-webhook never checked X-Hub-Signature-256, and
// said so in its own comments; 0033 reasoned that a forged claim was inert
// because only the browser holding the token could complete it. That stopped
// being true at 0052, when anyone could mint a sign-in token. The repo is
// public. Fixed the same day: every POST is checked against Meta's HMAC of the
// raw body, keyed with WHATSAPP_APP_SECRET, and refused before anything is
// read or written.
//
// IT RUNS THE REAL FILE. Node 24 strips the TypeScript itself
// (module.stripTypeScriptTypes), so the whole of whatsapp-webhook/index.ts runs
// in a vm: Deno.serve hands over the real handler, the database client and
// fetch are recorders, and every scenario is a real Request.
//
//   node webhook-signature-sim.js         live file, must PASS
//   node webhook-signature-sim.js --old   fn-pre-signature/, must FAIL (exit 1)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { stripTypeScriptTypes } = require('module');

const OLD = process.argv.indexOf('--old') > -1;
const FILE = OLD
  ? path.join(__dirname, 'fn-pre-signature', 'whatsapp-webhook.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-webhook', 'index.ts');
if (!stripTypeScriptTypes) { console.log('\n  SKIP: this Node cannot strip TypeScript\n'); process.exit(2); }
// core.autocrlf is true on this machine.
const src = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

const SECRET = 'test-app-secret-not-real';
const sign = (bytes, secret) => 'sha256=' + crypto.createHmac('sha256', secret || SECRET).update(bytes).digest('hex');

// One fresh sandbox per scenario: a shared context between scenarios is a trap.
function load(env) {
  const calls = [];
  const rec = (kind, detail) => calls.push({ kind, detail });
  // A query builder that records what it was asked and resolves to nothing.
  const builder = (table) => {
    const p = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res) => res({ data: null, error: null });
        return (...a) => { if (/^(insert|update|upsert|delete)$/.test(String(k))) rec('write', table + '.' + String(k)); return p; };
      },
    });
    return p;
  };
  const admin = {
    rpc: async (name, args) => { rec('rpc', name + ' ' + JSON.stringify(args)); return { data: { ok: true, kind: 'signin', finish: 'f'.repeat(32) }, error: null }; },
    from: (t) => { rec('from', t); return builder(t); },
  };
  let handler = null;
  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    Deno: { serve: (h) => { handler = h; }, env: { get: (k) => env[k] } },
    Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, crypto: globalThis.crypto,
    fetch: async (u, o) => { rec('fetch', String(u) + ' ' + String((o && o.body) || '').slice(0, 160)); return new Response('{}'); },
    adminClient: () => admin,
    json: (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'content-type': 'application/json' } }),
    phoneKey: (p) => String(p || '').replace(/\D/g, '').slice(-9),
    CATEGORIES: [], buildSearchDoc: () => '', embedDoc: async () => [],
  };
  // The imports are supplied above; everything else is the real file.
  const js = stripTypeScriptTypes(src.replace(/^import [^\n]*\n/gm, ''));
  vm.runInNewContext(js, ctx, { filename: path.basename(FILE) });
  if (!handler) throw new Error('Deno.serve was never called');
  return { handler, calls };
}

const URL_ = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co/functions/v1/whatsapp-webhook';
// Meta sends non-ASCII ESCAPED (ד) and signs exactly those bytes. Built the
// same way here, so a check that re-serialised the JSON before hashing would
// produce different bytes and be caught.
const message = (from, text, name) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
  messaging_product: 'whatsapp',
  contacts: [{ profile: { name: name || 'Maya' }, wa_id: from }],
  messages: [{ from, id: 'wamid.x', timestamp: '1791300000', type: 'text', text: { body: text } }],
} }] }] }).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const post = (body, sig) => new Request(URL_, { method: 'POST', body,
  headers: Object.assign({ 'content-type': 'application/json' }, sig ? { 'x-hub-signature-256': sig } : {}) });
const acted = (calls) => calls.filter((c) => c.kind !== 'from' || true).filter((c) => c.kind === 'rpc' || c.kind === 'write' || c.kind === 'fetch');

console.log('\n── the webhook acts only on what Meta sent ── '
  + (OLD ? 'BASELINE, before the check (must FAIL)' : 'live file') + ' ──\n');

(async () => {
  const ENV = { WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'vt', WHATSAPP_TOKEN: 'wt', WHATSAPP_PHONE_ID: '123', APP_URL: 'https://trustnetsocial.com' };
  const VICTIM = '972541230000';
  const forged = message(VICTIM, 'Join Trustnet: ' + 'a'.repeat(32));

  // 1 · Meta's handshake is a GET with no body and no signature. Untouched.
  {
    const { handler } = load(ENV);
    const r = await handler(new Request(URL_ + '?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42', { method: 'GET' }));
    ck('Meta’s verification handshake still answers', r.status === 200 && (await r.text()) === '42');
  }
  // 2 · A forged message: no signature at all.
  {
    const { handler, calls } = load(ENV);
    const r = await handler(post(forged));
    ck('a message with NO signature is refused', r.status === 401, 'status ' + r.status);
    ck('...before anything is recorded, written or sent', acted(calls).length === 0,
       acted(calls).map((c) => c.kind + ':' + c.detail.slice(0, 40)).join(' | '));
  }
  // 3 · A forged message signed with the wrong secret.
  {
    const { handler, calls } = load(ENV);
    const r = await handler(post(forged, sign(Buffer.from(forged), 'some-other-secret')));
    ck('a message signed with the WRONG secret is refused', r.status === 401 && acted(calls).length === 0, 'status ' + r.status);
  }
  // 4 · A genuine message, its sender changed after Meta signed it.
  {
    const genuine = message('972500000001', 'Join Trustnet: ' + 'b'.repeat(32));
    const sig = sign(Buffer.from(genuine));
    const tampered = genuine.replace('972500000001', VICTIM);
    const { handler, calls } = load(ENV);
    const r = await handler(post(tampered, sig));
    ck('a signed message whose sender was CHANGED is refused', r.status === 401 && acted(calls).length === 0, 'status ' + r.status);
  }
  // 5 · No secret configured: fail closed, even with a plausible header.
  {
    const env = Object.assign({}, ENV); delete env.WHATSAPP_APP_SECRET;
    const { handler, calls } = load(env);
    const r = await handler(post(forged, sign(Buffer.from(forged))));
    ck('with no secret configured, NOTHING is accepted', r.status === 401 && acted(calls).length === 0, 'status ' + r.status);
  }
  // 6 · The real thing: signed by Meta's secret, over the raw bytes - with a
  //     Hebrew profile name and an emoji, where re-serialising would differ.
  {
    const body = message('972500000002', 'Join Trustnet: ' + 'c'.repeat(32), 'דני 🌊');
    const { handler, calls } = load(ENV);
    const r = await handler(post(body, sign(Buffer.from(body, 'utf8'))));
    const claim = calls.find((c) => c.kind === 'rpc' && /^record_invite_claim/.test(c.detail));
    const reply = calls.find((c) => c.kind === 'fetch' && /graph\.facebook\.com/.test(c.detail));
    ck('a message Meta signed goes through', r.status === 200, 'status ' + r.status);
    ck('...and records the claim for the number that sent it',
       !!claim && /"p_phone":"\+972500000002"/.test(claim.detail) && /"p_name":"דני/.test(claim.detail),
       claim ? claim.detail.slice(0, 100) : 'no record_invite_claim call');
    ck('...and replies to that number', !!reply && /972500000002/.test(reply.detail));
    ck('...in the uppercase-hex form too', await (async () => {
      const { handler: h2 } = load(ENV);
      // Uppercase the HEX only; Meta's prefix is always "sha256=".
      const upper = 'sha256=' + sign(Buffer.from(body, 'utf8')).slice(7).toUpperCase();
      const r2 = await h2(post(body, upper));
      return r2.status === 200;
    })());
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (OLD) {
    console.log(fail > 0
      ? '  CONTROL OK — the baseline acts on forged messages, so the checks above measure the fix.\n'
      : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + (e && e.stack || e) + '\n'); process.exit(1); });
