// ═══════════════════════════════════════════════════════════════════════════
// one-normaliser-sim — a phone number is read by ONE rule, whichever door it
// comes in through.
//
// THE FAULT (25 Sep 2026). The app had two rules and chose between them by
// which form you were standing in.
//
//   Add member  → toE164(typed, iso), libphonenumber, a country picker beside
//                 the field. Built in v0.70.0 precisely because a hand-written
//                 rule corrupts numbers: Israel, France, Germany and the UK
//                 drop the trunk zero, ITALY KEEPS IT.
//   Invite      → normalizeIlPhone, whose whole rule was "a leading zero means
//                 Israel", and no picker at all.
//
// So the invite form REFUSED a US number written the way an American writes it.
// (646) 384-6833 reduces to 6463846833: ten digits, no leading zero, off the
// end of the rules and into ''. What it said was "Enter a valid phone number,
// e.g. 050 123 4567." — advice you cannot follow if you are not Israeli. There
// has been a +1 member in this database since 20 August.
//
// And the two disagreed about what to STORE: the invite opened WhatsApp with
// one form of the number and then wrote a member row with another, so the
// duplicate check above it could not match its own output.
//
// WHAT THIS ASSERTS: that there is one rule, that every caller goes through it,
// that the country is the user's answer rather than the app's guess, and that
// FAIL OPEN survives — with the library blocked a number is still stored as
// typed, and is NOT offered as a link.
//
// BASELINE: index.pre-v0.99.2.html (v0.99.1), the file this fix was made
// against — the version where both normalisers were live.
//
//   node one-normaliser-sim.js         → live code, must PASS
//   node one-normaliser-sim.js --old   → the baseline, must FAIL
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const INDEX = useOld
  ? path.join(__dirname, 'index.pre-v0.99.2.html')
  : path.join(__dirname, '..', 'web', 'index.html');
const BUNDLE = [path.join(__dirname, 'libphonenumber-min.js'),
                '/tmp/lpn/package/bundle/libphonenumber-min.js']
               .find(function(p) { return fs.existsSync(p); });

if (!fs.existsSync(INDEX)) { console.log('\n  FATAL: cannot read ' + INDEX + '\n'); process.exit(2); }
if (!BUNDLE) {
  console.log('\n  FATAL: no libphonenumber bundle. This checks the library layer;');
  console.log('  without the library it would be measuring nothing.\n');
  process.exit(2);
}
// core.autocrlf is true on dan's machine: source sliced from a fresh checkout
// comes back with CRLF and every anchor below would silently miss.
const web = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ck = function(n, c, x) {
  if (c) { pass++; console.log('  ✓', n); }
  else { fail++; console.log('  ✗', n, x === undefined ? '' : x); }
};
const has = function(f) { return typeof f === 'function'; };

// ── lift the real phone layer, exactly as it is written ────────────────────
// Names that may be absent (they are the fix) are lifted if present and left
// undefined if not, so the control fails on ASSERTIONS rather than dying on a
// missing function — a crash proves nothing about behaviour.
function phoneCtx(withLibrary) {
  const ctx = { console: { log: function() {} } };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  if (withLibrary) vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), ctx);
  let src = '';
  ['PHONE_COMMON', 'PHONE_FALLBACK_CODES', 'PHONE_DEFAULT_COUNTRY'].forEach(function(c) {
    const m = web.match(new RegExp('const ' + c + ' = [^;]+;'));
    if (m) src = m[0] + '\n' + src;
  });
  ['phoneLib', 'phoneCountries', 'toE164', 'phoneNational', 'countryOptions',
   'phoneE164', 'phoneDialable', 'phoneTail'].forEach(function(n) {
    const m = web.match(new RegExp('function ' + n + '\\s*\\('));
    if (!m) return;
    let depth = 0, i = web.indexOf('{', m.index);
    for (; i < web.length; i++) {
      if (web[i] === '{') depth++;
      else if (web[i] === '}') { depth--; if (depth === 0) break; }
    }
    src += web.slice(m.index, i + 1) + '\n';
  });
  vm.runInContext(src, ctx);
  return ctx;
}

console.log('\n── one normaliser ── ' + path.basename(INDEX) + ' ──\n');

// ── 1 · there is only one rule left ────────────────────────────────────────
console.log('  one rule:');

ck('the hand-written Israel rule is gone',
   !/function normalizeIlPhone\s*\(/.test(web));
// The comments above the new code name it, on purpose — so the call count is
// taken from calls, not from mentions.
const callsOld = (web.match(/normalizeIlPhone\(/g) || []).length;
ck('...and nothing calls it any more', callsOld === 0, callsOld + ' call(s) left');
ck('there is a single normaliser', /function phoneE164\s*\(/.test(web));
ck('...that delegates to the library, not to a rule',
   /function phoneE164[\s\S]{0,700}?toE164\(/.test(web));
ck('a separate question is asked before a number becomes a LINK',
   /function phoneDialable\s*\(/.test(web));
ck('and a third before two numbers are COMPARED',
   /function phoneTail\s*\(/.test(web));

// ── 2 · the country is asked for, not guessed ──────────────────────────────
console.log('\n  the country:');

ck('the invite form has a country picker',
   /id="inv-country"/.test(web));
ck('...built from the same list as the member form',
   /id="inv-country"[\s\S]{0,200}?countryOptions\(/.test(web));
ck('the invite reads the picker', /getElementById\('inv-country'\)/.test(web));
ck('...and hands it to the normaliser',
   /phoneE164\(contact, invIso\)/.test(web));
ck('the default is a named constant, not a number buried in a rule',
   /const PHONE_DEFAULT_COUNTRY = 'IL';/.test(web));
ck('buildMember honours the country its caller was given',
   /phoneE164\(value, input\.iso\)/.test(web));

// ── 3 · one reading of the number, used everywhere ─────────────────────────
// The invite normalised the number three times over: once to validate, once
// for the wa.me link, once inside buildMember — and compared the RAW typed
// text against stored values in between.
console.log('\n  one reading:');

ck('the invite normalises once', (web.match(/phoneE164\(contact, invIso\)/g) || []).length === 1);
ck('the WhatsApp link uses that reading', /const ph = invPhone\.replace\(/.test(web));
ck('the member row stores that reading, with its country',
   /contactValue: invValue, iso: invIso/.test(web));
ck('the duplicate check compares against it too',
   /normContact\(m\.contactValue\) === normContact\(invValue\)/.test(web));
ck('and so does the server resolve',
   /resolveContacts\(circleId, \[\{ method: method, value: invValue \}\]\)/.test(web));
ck('a provider is only offered a WhatsApp button when it can be dialled',
   /if \(phoneDialable\(e164\)\) \{/.test(web));
ck('the chat-import dedup folds the way the DATABASE folds',
   /const ph = phoneTail\(it\.phone/.test(web));

// ── 4 · what it actually does, with the library ────────────────────────────
console.log('\n  with the library:');

const L = phoneCtx(true);
const E = L.phoneE164, D = L.phoneDialable, T = L.phoneTail;

ck('the number the invite refused: (646) 384-6833 in US',
   has(E) && E('(646) 384-6833', 'US') === '+16463846833',
   has(E) ? JSON.stringify(E('(646) 384-6833', 'US')) : 'phoneE164 missing');
ck('...and it is a number WhatsApp can open',
   has(E) && has(D) && D(E('(646) 384-6833', 'US')));
ck('Israel is unchanged: 054-554-3107',
   has(E) && E('054-554-3107', 'IL') === '+972545543107',
   has(E) ? JSON.stringify(E('054-554-3107', 'IL')) : 'missing');
ck('the eleven-day production fault is still repaired: +972 054 554 3107',
   has(E) && E('+972 054 554 3107', 'IL') === '+972545543107',
   has(E) ? JSON.stringify(E('+972 054 554 3107', 'IL')) : 'missing');
ck('Italy KEEPS its zero: 06 1234 5678',
   has(E) && E('06 1234 5678', 'IT') === '+390612345678',
   has(E) ? JSON.stringify(E('06 1234 5678', 'IT')) : 'missing');
ck('an international number ignores the picker entirely',
   has(E) && E('+16463846833', 'IL') === '+16463846833',
   has(E) ? JSON.stringify(E('+16463846833', 'IL')) : 'missing');
ck('00 is an international prefix, not digits',
   has(E) && E('001 646 384 6833', 'US') === '+16463846833',
   has(E) ? JSON.stringify(E('001 646 384 6833', 'US')) : 'missing');
ck('junk is refused', has(E) && E('12345', 'IL') === '',
   has(E) ? JSON.stringify(E('12345', 'IL')) : 'missing');
ck('nothing is refused loudly: empty in, empty out', has(E) && E('', 'IL') === '');

// ── 5 · FAIL OPEN, which is the rule that must not be lost ─────────────────
// dan's rule from v0.70.0: a member never added cannot be recovered; a value
// we could not canonicalise can be cleaned later. So with the CDN blocked the
// number is STORED as typed — and, because it is not a real international
// number, it is not turned into a link that goes nowhere.
console.log('\n  with the library blocked:');

const N = phoneCtx(false);
const NE = N.phoneE164, ND = N.phoneDialable;

ck('the library really is absent', !N.phoneLib());
ck('a typed number is still STORED, not refused',
   has(NE) && NE('050 123 4567', 'IL') === '050 123 4567',
   has(NE) ? JSON.stringify(NE('050 123 4567', 'IL')) : 'missing');
ck('...but it is NOT offered as a link',
   has(NE) && has(ND) && ND(NE('050 123 4567', 'IL')) === false);
ck('an international number still dials without the library',
   has(NE) && has(ND) && ND(NE('+972545543107', 'IL')) === true);
ck('...and is not corrupted on the way through',
   has(NE) && NE('+972545543107', 'IL') === '+972545543107');

// ── 6 · the fold agrees with the database ──────────────────────────────────
// phone_key() in SQL and phoneKey() in wa-signin both take the last nine
// digits. Anything in the client that COMPARES two numbers has to agree with
// them or identity splits.
console.log('\n  the fold:');

const FORMS = ['050-530-3690', '0505303690', '+972505303690', '972-50-530-3690', '050 530 3690'];
const keys = has(T) ? new Set(FORMS.map(T)) : new Set();
ck('every written form of one number folds to ONE key',
   has(T) && keys.size === 1, [].concat([...keys]).join(' | ') || 'phoneTail missing');
ck('...and that key is nine digits',
   has(T) && [...keys][0] && [...keys][0].length === 9);
ck('a different number folds differently',
   has(T) && T('054-5666006') !== [...keys][0]);
ck('the local copy inside the member form was deleted, not duplicated',
   /const tail = phoneTail;/.test(web));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (useOld) {
  console.log(fail > 0
    ? '  CONTROL OK — the baseline fails, so the checks above measure the fix.\n'
    : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  process.exit(fail > 0 ? 0 : 1);
}
process.exit(fail ? 1 : 0);
