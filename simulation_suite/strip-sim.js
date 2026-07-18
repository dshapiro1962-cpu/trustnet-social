// strip-sim.js — v0.13.0 delivery strip simulation (rebuilt harness, 12 checks)
// Loads the REAL app script in a vm sandbox with DOM/network stubs.
const vm = require('vm');
const fs = require('fs');

let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
// Known harness gotcha: top-level const/function bindings need an appended exporter
src += ';globalThis.__x = { renderDeliveryStrip: typeof renderDeliveryStrip !== "undefined" ? renderDeliveryStrip : null, renderQuerySent, channelWord, handleResendMember, handleSendQuery, AppState, APP_VERSION };';

const toasts = [];
const el = (over) => Object.assign({
  value: '', style: {}, dataset: {}, innerHTML: '', className: '', textContent: '',
  addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
  closest() { return null; }, appendChild() {}, remove() {}, focus() {},
  setAttribute() {}, getAttribute() { return null; }, classList: { add() {}, remove() {}, toggle() {} },
}, over || {});

const byId = {};
const documentStub = {
  getElementById: (id) => byId[id] || null,
  querySelectorAll: () => [], querySelector: () => null,
  createElement: () => el(), addEventListener() {}, removeEventListener() {},
  body: el(), documentElement: el(), head: el(),
  hidden: false, visibilityState: 'visible',
};

const fnPostCalls = [];
let fnPostImpl = async () => ({});

const ctx = {
  console, setTimeout: (f) => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  document: documentStub,
  window: { supabase: null /* set below */, addEventListener() {}, location: { href: 'https://x', search: '', hash: '', origin: 'https://x' }, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  location: { href: 'https://x', search: '', hash: '', origin: 'https://x' },
  navigator: { userAgent: 'sim', language: 'en' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  supabase: { createClient: () => ({ from: () => ({}), auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }) }, rpc: () => ({ then() {} }), channel: () => ({}) }) },
  crypto: { randomUUID: () => 'uuid-sim', subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, AbortController,
  confirm: () => true, alert() {}, prompt: () => null,
  history: { replaceState() {}, pushState() {} },
};
ctx.window.supabase = ctx.supabase;
ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

(async () => {
  // ── 1. Script loads under stubs ──
  try { vm.runInContext(src, ctx, { filename: 'app.js' }); check('app script executes in sandbox', true); }
  catch (e) { check('app script executes in sandbox', false, e.message); process.exit(1); }
  const X = ctx.__x;

  // Override render + network from inside the harness
  vm.runInContext('renderApp = function(){ globalThis.__renders = (globalThis.__renders||0)+1; };'
    + 'toast = function(m,t){ globalThis.__toasts.push([m,t||"ok"]); };'
    + 'fnPost = async function(n,b){ globalThis.__calls.push([n,b]); return globalThis.__fnPostImpl(n,b); };', ctx);
  ctx.__toasts = toasts; ctx.__calls = fnPostCalls; ctx.__fnPostImpl = (n, b) => fnPostImpl(n, b);

  check('APP_VERSION bumped to v0.19.0', X.APP_VERSION === 'v0.19.0 · live', X.APP_VERSION);
  check('renderDeliveryStrip exists', typeof X.renderDeliveryStrip === 'function');

  // ── 2. Strip rendering ──
  const mixed = { deliveries: [
    { member_id: 'm1', member: 'dan test', channel: 'whatsapp', status: 'sent', error: null },
    { member_id: 'm2', member: 'naama', channel: 'email', status: 'sent', error: null },
    { member_id: 'm3', member: 'uri', channel: 'whatsapp', status: 'failed', error: 'wa_api_error_131026' },
  ] };
  const html = X.renderDeliveryStrip(mixed);
  check('strip: statuses in words (Sent + Failed)', html.includes('>Sent<') && html.includes('>Failed<'));
  check('strip: NO ✓✓ (reserved for corroboration)', !html.includes('✓✓'));
  check('strip: verbatim error surfaced', html.includes('wa_api_error_131026'));
  check('strip: failed row has email input + Resend', html.includes('dstrip-email') && html.includes('data-action="resend-member"'));
  check('strip: summary counts sent/failed', html.includes('2 sent') && html.includes('1 failed'));
  check('strip: all-sent summary wording', X.renderDeliveryStrip({ deliveries: mixed.deliveries.slice(0, 2) }).includes('Sent to all 2 contacts'));
  check('strip: empty when no deliveries (old backend)', X.renderDeliveryStrip({}) === '');

  // ── 3. renderQuerySent embeds the strip ──
  X.AppState.circleById = () => ({ id: 'c1', name: 'Dining', color: '#217A4B' });
  X.AppState.membersOfCircle = () => [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  X.AppState.memberById = () => null;
  const sentHtml = X.renderQuerySent({ circleId: 'c1', text: 'best hummus?', responses: [], visibleCount: 0, deliveries: mixed.deliveries });
  check('sent view embeds delivery strip', sentHtml.includes('q-delivery-strip'));

  // ── 4. handleSendQuery wiring: deliveries land in queryState ──
  byId['q-text'] = el({ value: 'best hummus in the city?' });
  byId['q-circle'] = el({ value: 'c1' });
  X.AppState.isDemoMode = false;
  X.AppState.userQueries = [];
  fnPostImpl = async (name) => {
    if (name === 'check-similar-query') throw new Error('dark');
    if (name === 'send-query') return { engine: 'send-query-v5-strip', query_id: 'q9', sent: 2,
      failures: [{ member: 'uri', error: 'wa_api_error_131026' }], deliveries: mixed.deliveries };
    return {};
  };
  await vm.runInContext('handleSendQuery()', ctx);
  check('send: deliveries stored on queryState', ctx.__x.AppState.queryState && Array.isArray(ctx.__x.AppState.queryState.deliveries) && ctx.__x.AppState.queryState.deliveries.length === 3);
  check('send: no legacy failure toast when deliveries present', !toasts.some((t) => String(t[0]).indexOf("Couldn't reach") === 0));

  // ── 5. handleResendMember: success flips row to sent ──
  const rowStub = el(); const emailInput = el({ value: 'uri@example.com' });
  rowStub.querySelector = (sel) => (sel === '.dstrip-email' ? emailInput : null);
  const btn = el({ dataset: { memberId: 'm3', memberName: 'uri' } });
  btn.closest = () => rowStub;
  fnPostImpl = async (name, body) => {
    if (name === 'resend-member') return { engine: 'resend-member-v1', ok: true, member_id: body.member_id, member: 'uri', channel: 'email', status: 'sent', error: null };
    return {};
  };
  ctx.__btn = btn;
  await vm.runInContext('handleResendMember(__btn)', ctx);
  const d3 = ctx.__x.AppState.queryState.deliveries.find((d) => d.member_id === 'm3');
  check('resend ok: row → sent via email', d3.status === 'sent' && d3.channel === 'email' && d3.error === null);
  check('resend ok: payload carried query_id + member_id + email', (() => {
    const c = fnPostCalls.find((c) => c[0] === 'resend-member');
    return c && c[1].query_id === 'q9' && c[1].member_id === 'm3' && c[1].email === 'uri@example.com';
  })());

  // ── 6. handleResendMember: delivery failure keeps verbatim error ──
  d3.status = 'failed'; d3.error = 'old';
  fnPostImpl = async (name) => (name === 'resend-member'
    ? { engine: 'resend-member-v1', ok: false, member_id: 'm3', member: 'uri', channel: 'email', status: 'failed', error: 'resend_smtp_550_mailbox_unavailable' }
    : {});
  await vm.runInContext('handleResendMember(__btn)', ctx);
  check('resend fail: verbatim error on row + toast', d3.status === 'failed' && d3.error === 'resend_smtp_550_mailbox_unavailable'
    && toasts.some((t) => String(t[0]).includes('resend_smtp_550_mailbox_unavailable')));

  console.log('\nRESULT:', pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
