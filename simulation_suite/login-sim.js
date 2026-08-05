// login-sim.js — operates the REAL login flow: send link, code entry (5-10 digits,
// spaces, failures), back link. Functional DOM stubs with working event listeners.
const vm = require('vm'); const fs = require('fs');
let src = fs.readFileSync('/home/claude/sim/app_script.js', 'utf8');
src += ';globalThis.__x = { showLoginScreen };';

function el(id) {
  const listeners = {};
  return {
    id, value: '', textContent: '', style: {}, dataset: {}, innerHTML: '', disabled: false,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    fire(ev, arg) { (listeners[ev] || []).forEach((f) => f(arg || { key: '', preventDefault() {} })); },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {} }, focus() {},
  };
}
const ids = {};
['app','onboarding','login','login-form','login-sent','login-send','login-email','login-err',
 'login-sent-addr','login-code','login-verify','login-code-err','login-back'].forEach((i) => { ids[i] = el(i); });

let reloaded = false;
let otpCalls = [], verifyCalls = [], verifyResult = { error: null, data: {} };
const ctx = {
  console: { log() {}, error() {}, warn() {} },
  setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  document: { getElementById: (i) => ids[i] || null, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => el('x'), addEventListener() {}, removeEventListener() {},
    body: el('body'), documentElement: el('html'), head: el('head'), hidden: false, visibilityState: 'visible' },
  window: { supabase: null, addEventListener() {}, location: { href: 'https://x', search: '', hash: '', origin: 'https://x' }, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  location: { href: 'https://x', search: '', hash: '', origin: 'https://x', reload: () => { reloaded = true; } },
  navigator: { userAgent: 'sim', language: 'en' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  crypto: { randomUUID: () => 'u', subtle: { digest: async () => new ArrayBuffer(32) } },
  URLSearchParams, TextEncoder, AbortController, confirm: () => true, alert() {}, prompt: () => null,
  history: { replaceState() {}, pushState() {} },
};
ctx.supabase = { createClient: () => ({
  from: () => ({}),
  auth: {
    onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }),
    signInWithOtp: async (args) => { otpCalls.push(args); return { error: null }; },
    verifyOtp: async (args) => { verifyCalls.push(args); return verifyResult; },
  },
  rpc: () => ({}), channel: () => ({}),
}) };
ctx.window.supabase = ctx.supabase; ctx.globalThis = ctx;
vm.createContext(ctx);

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

(async () => {
  vm.runInContext(src, ctx, { filename: 'app.js' });
  const X = ctx.__x;

  // markup guarantees
  const html = fs.readFileSync('/home/claude/app/index.html', 'utf8');
  check('markup: code input maxlength=12 (fits 10 digits + pasted spaces)', html.includes('id="login-code"') && /id="login-code"[^>]*maxlength="12"/.test(html));
  check('markup: one-time-code autocomplete for OS autofill', /id="login-code"[^>]*autocomplete="one-time-code"/.test(html));

  X.showLoginScreen();
  check('login screen shows', ids['login'].style.display === 'flex');

  // send link
  ids['login-email'].value = 'dan@test.com';
  ids['login-send'].fire('click');
  await new Promise((r) => setImmediate(r));
  check('send: signInWithOtp called with email', otpCalls.length === 1 && otpCalls[0].email === 'dan@test.com');
  check('send: switches to code state', ids['login-form'].style.display === 'none' && ids['login-sent'].style.display === 'block');
  check('send: address shown for verify to reuse', ids['login-sent-addr'].textContent === 'dan@test.com');

  // too-short code rejected locally
  ids['login-code'].value = '1234';
  ids['login-verify'].fire('click');
  await new Promise((r) => setImmediate(r));
  check('4 digits: rejected locally, no server call', verifyCalls.length === 0 && ids['login-code-err'].style.display === 'block');

  // 5-digit code accepted (Supabase minimum)
  ids['login-code'].value = '12345';
  verifyResult = { error: { message: 'otp_expired' } };
  ids['login-verify'].fire('click');
  await new Promise((r) => setImmediate(r));
  check('5 digits: sent to verifyOtp with right payload', verifyCalls.length === 1 && verifyCalls[0].token === '12345' && verifyCalls[0].email === 'dan@test.com' && verifyCalls[0].type === 'email');
  check('server error: verbatim + button restored', ids['login-code-err'].textContent.includes('otp_expired') && ids['login-verify'].disabled === false);

  // 8-digit code with pasted spaces succeeds
  ids['login-code'].value = ' 1234 5678 ';
  verifyResult = { error: null, data: {} };
  ids['login-verify'].fire('click');
  await new Promise((r) => setImmediate(r));
  check('8 digits + spaces: digits extracted, verified', verifyCalls.length === 2 && verifyCalls[1].token === '12345678');
  check('success: page reloads into session', reloaded === true);

  // 10-digit code passes local validation
  reloaded = false; ids['login-code'].value = '1234567890';
  ids['login-verify'].fire('click');
  await new Promise((r) => setImmediate(r));
  check('10 digits: accepted (Supabase maximum)', verifyCalls.length === 3 && verifyCalls[2].token === '1234567890');

  // back link returns to form
  ids['login-back'].fire('click');
  check('back link: returns to email form', ids['login-sent'].style.display === 'none' && ids['login-form'].style.display === 'block');

  // enter key triggers verify
  ids['login-code'].value = '123456';
  ids['login-code'].fire('keydown', { key: 'Enter', preventDefault() {} });
  await new Promise((r) => setImmediate(r));
  check('Enter key verifies (6 digits, the classic)', verifyCalls.length === 4 && verifyCalls[3].token === '123456');

  console.log('\nRESULT:', pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
