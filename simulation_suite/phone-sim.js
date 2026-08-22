// ═══════════════════════════════════════════════════════════════════════════
// phone-sim — a phone number has ONE legal stored form, and the field never
// refuses to work.
//
// WHY THIS EXISTS (22 Aug 2026)
// `+9720545543107` sat in production for eleven days. Country code 972 followed
// by a national number beginning 0 — a trunk prefix that must be dropped in
// E.164 — so the number IS NOT DIALABLE. phone_key() folds it onto the same
// last-nine key as the correct number, so identity looked right while delivery
// was broken, and the app displayed it as fine. 0038 cleaned the stored value;
// nothing stopped it being typed again.
//
// normalizeIlPhone accepted it because its whole rule was "starts with + and is
// at least 11 characters long".
//
// WHY A LIBRARY: Israel, France, Germany and the UK DROP the trunk zero in
// E.164. ITALY KEEPS IT — +39 06... is correct. A hand-written "strip the
// leading zero" rule corrupts every Italian number. That is not a hypothetical:
// it is what I was about to write.
//
// FAIL OPEN is tested here as hard as the happy path. If the CDN is blocked the
// number must be stored AS TYPED, not refused — a member never added cannot be
// recovered; a value we could not canonicalise can be cleaned later.
//
// Usage: node phone-sim.js [indexPath] [bundlePath]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function resolve(arg, candidates) {
  if (arg) return arg;
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}
const INDEX = resolve(process.argv[2], [
  path.join(__dirname, '..', 'web', 'index.html'),
  '/home/claude/app/index.html']);
const BUNDLE = resolve(process.argv[3], [
  path.join(__dirname, 'libphonenumber-min.js'),
  '/tmp/lpn/package/bundle/libphonenumber-min.js']);

if (!fs.existsSync(INDEX)) {
  console.log('\n  FATAL: cannot read ' + INDEX + '\n');
  process.exit(2);
}
const web = fs.readFileSync(INDEX, 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  \u2713', n); }
                          else { fail++; console.log('  \u2717', n, x === undefined ? '' : x); } };

// ── build a context holding ONLY the phone layer from the real file ────────
function phoneCtx(withLibrary) {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  if (withLibrary) {
    if (!fs.existsSync(BUNDLE)) {
      console.log('\n  FATAL: cannot read the libphonenumber bundle at ' + BUNDLE);
      console.log('  This check cannot pass without the library it is testing.\n');
      process.exit(2);
    }
    vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), ctx);
  }
  // lift the phone layer out of index.html by name, so the test runs THE REAL
  // FUNCTIONS rather than a copy that can drift from them
  const names = ['phoneLib', 'phoneCountries', 'toE164', 'phoneNational', 'countryOptions'];
  let src = '';
  for (const n of names) {
    const re = new RegExp('function ' + n + '\\s*\\(');
    const m = web.match(re);
    if (!m) { console.log('  FATAL: ' + n + ' not found in index.html'); process.exit(2); }
    const start = m.index;
    let depth = 0, i = web.indexOf('{', start);
    for (; i < web.length; i++) {
      if (web[i] === '{') depth++;
      else if (web[i] === '}') { depth--; if (depth === 0) break; }
    }
    src += web.slice(start, i + 1) + '\n';
  }
  // the two constants the layer depends on
  for (const c of ['PHONE_COMMON', 'PHONE_FALLBACK_CODES']) {
    const m = web.match(new RegExp('const ' + c + ' = [^;]+;'));
    if (m) src = m[0] + '\n' + src;
  }
  vm.runInContext(src, ctx);
  return ctx;
}

console.log('\n\u2500\u2500 phone entry \u2500\u2500 one legal stored form, and never refuses \u2500\u2500\n');

const L = phoneCtx(true);

// ── 1 · the fault this exists for ─────────────────────────────────────────
console.log('  the production fault:');
let r = L.toE164('0545543107', 'IL');
ck('an Israeli typing 0545543107 stores +972545543107',
   r.e164 === '+972545543107' && r.ok, r.e164);
r = L.toE164('054 554 3107', 'IL');
ck('...spaces make no difference', r.e164 === '+972545543107', r.e164);
r = L.toE164('054-554-3107', 'IL');
ck('...dashes make no difference', r.e164 === '+972545543107', r.e164);
r = L.toE164('+972 054 554 3107', 'IL');
ck('...and a trunk zero the user pasted in is DROPPED, not stored',
   r.e164 === '+972545543107', r.e164);

// ── 2 · the country a rule would have broken ──────────────────────────────
console.log('\n  countries a hand-written rule gets wrong:');
r = L.toE164('06 1234 5678', 'IT');
ck('ITALY KEEPS its trunk zero: +390612345678', r.e164 === '+390612345678', r.e164);
r = L.toE164('020 7946 0958', 'GB');
ck('UK drops its zero: +442079460958', r.e164 === '+442079460958', r.e164);
r = L.toE164('0176 12345678', 'DE');
ck('Germany drops its zero: +4917612345678', r.e164 === '+4917612345678', r.e164);
r = L.toE164('06 12 34 56 78', 'FR');
ck('France drops its zero: +33612345678', r.e164 === '+33612345678', r.e164);
r = L.toE164('(646) 384-6833', 'US');
ck('US brackets and dashes: +16463846833', r.e164 === '+16463846833', r.e164);

// ── 3 · nonsense is refused, but only when it is certainly nonsense ───────
console.log('\n  refusal:');
r = L.toE164('12345', 'IL');
ck('too short is flagged impossible', !r.ok && r.reason === 'impossible', r.reason);
r = L.toE164('', 'IL');
ck('empty is empty', r.e164 === '' && r.reason === 'empty', r.reason);

// ── 4 · FAIL OPEN — the library is not there ──────────────────────────────
console.log('\n  the CDN is blocked:');
const N = phoneCtx(false);
ck('phoneLib() reports absence rather than throwing', N.phoneLib() === null);
r = N.toE164('0545543107', 'IL');
ck('the number is STORED AS TYPED, not refused', r.e164 === '0545543107' && r.ok, r.e164 + '/' + r.reason);
ck('...and the reason says why', r.reason === 'no_library', r.reason);
ck('a country list is still offered', N.phoneCountries().length >= 20, String(N.phoneCountries().length));
ck('...including Israel with the right code',
   N.phoneCountries().some(function(c) { return c.iso === 'IL' && c.code === '972'; }));
ck('countryOptions still renders', /<option value="IL"/.test(N.countryOptions('IL')));

// ── 5 · the country list ──────────────────────────────────────────────────
console.log('\n  the picker:');
const cs = L.phoneCountries();
ck('covers a broad set, not two countries', cs.length > 200, String(cs.length));
ck('Israel is first', cs[0] && cs[0].iso === 'IL', cs[0] && cs[0].iso);
ck('every entry has a dialling code', cs.every(function(c) { return /^[0-9]+$/.test(c.code); }));
const opts = L.countryOptions('US');
ck('the selected country is preselected', /<option value="US" selected>/.test(opts));

// ── 6 · display ───────────────────────────────────────────────────────────
console.log('\n  display:');
ck('a stored number reads as its national form',
   L.phoneNational('+972545543107').replace(/\s|-/g, '') === '0545543107',
   L.phoneNational('+972545543107'));
ck('...and an unparseable one is shown as-is, not blanked',
   L.phoneNational('not a number') === 'not a number');

// ── 7 · the field is wired ────────────────────────────────────────────────
console.log('\n  wiring:');
ck('the country picker exists in the dialog', /id="nm-country"/.test(web));
ck('the national field exists', /id="nm-phone"/.test(web));
ck('the save path reads both', /getElementById\('nm-country'\)/.test(web)
   && /getElementById\('nm-phone'\)/.test(web));
ck('the save path calls toE164', /toE164\(nat, iso\)/.test(web));
ck('the library is loaded with defer', /defer src="[^"]*libphonenumber/.test(web));
ck('an impossible number blocks the save',
   /r\.reason === 'impossible'[\s\S]{0,160}return;/.test(web));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
