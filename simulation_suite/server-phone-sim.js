// ═══════════════════════════════════════════════════════════════════════════
// server-phone-sim — the SERVER stops guessing a country too.
//
// v0.99.2 unified the two phone normalisers in the client and gave the invite
// form a country picker. One layer down, _shared/utils.ts had its own toE164
// ending in exactly the rule that was deleted:
//
//     if (d.startsWith("972")) return d;
//     if (d.startsWith("0")) return "972" + d.slice(1);
//
// A British 07911 123456 would have become 972 7911123456. An Italian 06 would
// have become 9726. Silently, and on the sign-in path.
//
// IT NEVER FIRED, and that was checked rather than assumed. A census of
// production on 26 Sep 2026:
//     invite_claims.claimed_phone   13 of 13 start with "+"  (+972 x12, +1 x1)
//     members.contact_value (wa)    25 of 25 start with "+"
//     users.phone                   10 of 11 start with "+", the 11th already
//                                   international
// Zero national-format values anywhere. Every caller takes its number from
// WhatsApp, which reports full international digits. So the rule was dead code
// that could only ever be wrong — which is the best possible moment to remove
// one, because removing it cannot change any existing behaviour.
//
// WHAT IS ASSERTED: that the guess is gone, that international numbers still
// come through untouched (this is the SIGN-IN path — breaking it locks
// everyone out), and that the three callers handle the new "" answer rather
// than propagating "+" into a send or an account.
//
// There is no Deno on this machine, so the function body is lifted out of the
// TypeScript and run in a vm with its one type annotation stripped. That runs
// THE REAL BODY; a transcribed copy would be a different function wearing its
// name.
//
// BASELINE: simulation_suite/fn-pre-2026-09-26/, copied from the three files
// before a character of this fix was written.
//
//   node server-phone-sim.js         → live code, must PASS
//   node server-phone-sim.js --old   → the baseline, must FAIL
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const BASE = path.join(__dirname, 'fn-pre-2026-09-26');
const FN = path.join(__dirname, '..', 'supabase', 'functions');

const SRC = useOld
  ? { utils: path.join(BASE, 'utils.ts'),
      join:  path.join(BASE, 'complete-join.ts'),
      wa:    path.join(BASE, 'wa-signin.ts') }
  : { utils: path.join(FN, '_shared', 'utils.ts'),
      join:  path.join(FN, 'complete-join', 'index.ts'),
      wa:    path.join(FN, 'wa-signin', 'index.ts') };

for (const k of Object.keys(SRC)) {
  if (!fs.existsSync(SRC[k])) { console.log('\n  FATAL: missing ' + SRC[k] + '\n'); process.exit(2); }
}
// core.autocrlf is true here; every anchor below would silently miss on CRLF.
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const utils = lf(SRC.utils), join = lf(SRC.join), wa = lf(SRC.wa);

// "A guard that passes for the wrong reason is worse than no guard", and one of
// the four that did on 25 Aug "anchored on a phrase that first occurs in the
// comment written directly above the fix". This sim did it too, on its first
// run: the new comment in utils.ts QUOTES the two deleted lines so the next
// reader knows what was removed and why, and the structural checks below
// matched the quotation. Both reported FAIL against correct code.
//
// So a structural assertion about what the code DOES must read the code only.
// Whole comment lines go; a line with an inline // after real code keeps its
// code, and no assertion here depends on what follows one.
const codeOnly = (src) => src.split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');
const utilsCode = codeOnly(utils);

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

// ── lift the real toE164 out of the TypeScript ─────────────────────────────
function liftToE164(src) {
  const m = src.match(/export function toE164\s*\(/);
  if (!m) return null;
  let depth = 0, i = src.indexOf('{', m.index);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const ts = src.slice(m.index, i + 1)
    .replace(/^export\s+/, '')
    .replace(/\(raw:[^)]*\)\s*:\s*string/, '(raw)');   // the only annotation in it
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(ts + '; globalThis.__f = toE164;', ctx);
  return ctx.__f;
}

console.log('\n── server phone normaliser ── '
  + (useOld ? 'BASELINE fn-pre-2026-09-26' : 'live') + ' ──\n');

const f = liftToE164(utils);

// ── 0 · prove the environment before asserting anything ────────────────────
console.log('  the environment:');
ck('the real toE164 was lifted and runs', typeof f === 'function');
if (typeof f !== 'function') {
  console.log('\n  FATAL: nothing to measure.\n');
  process.exit(2);
}
ck('...and it is the one from utils.ts, not a copy in this file',
   /export function toE164/.test(utils));

// ── 1 · the guess is gone ──────────────────────────────────────────────────
console.log('\n  no country is inferred:');
ck('the "leading zero means Israel" line is gone',
   !/return "972" \+ d\.slice\(1\)/.test(utilsCode));
ck('the "starts with 972" special case is gone too',
   !/d\.startsWith\("972"\)/.test(utilsCode));
ck('a national-format Israeli number is REFUSED, not assumed',
   f('0545543107') === '', JSON.stringify(f('0545543107')));
ck('a British national number is not turned into an Israeli one',
   f('07911 123456') === '', JSON.stringify(f('07911 123456')));
ck('an Italian national number is not turned into an Israeli one',
   f('06 1234 5678') === '', JSON.stringify(f('06 1234 5678')));

// ── 2 · the sign-in path still works ───────────────────────────────────────
// Everything WhatsApp reports is international. If any of these changed,
// every member would be locked out, so they matter more than section 1.
console.log('\n  what WhatsApp actually sends is untouched:');
ck('+972545543107 → 972545543107',
   f('+972545543107') === '972545543107', JSON.stringify(f('+972545543107')));
ck('bare 972545543107 → 972545543107',
   f('972545543107') === '972545543107', JSON.stringify(f('972545543107')));
ck('the +1 member: +16463846833 → 16463846833',
   f('+16463846833') === '16463846833', JSON.stringify(f('+16463846833')));
ck('bare 16463846833 stays itself',
   f('16463846833') === '16463846833', JSON.stringify(f('16463846833')));
ck('00 is still the international prefix',
   f('00972545543107') === '972545543107', JSON.stringify(f('00972545543107')));
ck('punctuation and spaces are still stripped',
   f('+972 (54) 554-3107') === '972545543107', JSON.stringify(f('+972 (54) 554-3107')));
ck('empty in, empty out', f('') === '' && f(null) === '' && f(undefined) === '');

// ── 3 · the callers handle the new answer ──────────────────────────────────
// A function that returns "" is only safe if nobody concatenates it onto "+".
console.log('\n  the three callers:');
ck('complete-join skips the member lookup when there is no dialable form',
   /const \{ data: knownAs \} = \(link && e164\)/.test(join));
ck('...and says why, so the next reader does not "simplify" it back',
   /quietly match nothing/.test(join));
ck('wa-signin refuses to send to an empty recipient',
   /if \(!to\) \{[\s\S]{0,120}return err\("unusable_phone"\)/.test(wa));
ck('...rather than letting Meta answer for it',
   /const to = toE164\(rawPhone\);/.test(wa));
ck('wa-signin does not create an account whose phone is "+"',
   /toE164\(rawPhone\) \? "\+" \+ toE164\(rawPhone\) : undefined/.test(wa));
ck('no caller concatenates "+" onto an unchecked toE164',
   !/"\+" \+ toE164\(rawPhone\),/.test(wa));

// ── 4 · it still agrees with phoneKey, which is the identity rule ──────────
// phoneKey folds to the last nine digits and is what the database, the client
// and the webhook all compare on. toE164 is for DELIVERY. They must not drift
// into each other again - that conflation is the bug the comment above
// phoneKey describes.
console.log('\n  delivery and identity stay separate:');
const keyM = utils.match(/export function phoneKey\s*\(/);
let key = null;
if (keyM) {
  let depth = 0, i = utils.indexOf('{', keyM.index);
  for (; i < utils.length; i++) {
    if (utils[i] === '{') depth++;
    else if (utils[i] === '}') { depth--; if (depth === 0) break; }
  }
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(utils.slice(keyM.index, i + 1)
    .replace(/^export\s+/, '')
    .replace(/\(raw:[^)]*\)\s*:\s*string/, '(raw)')
    + '; globalThis.__k = phoneKey;', ctx);
  key = ctx.__k;
}
ck('phoneKey is still there and still folds to nine digits',
   typeof key === 'function' && key('+972545543107') === '545543107',
   typeof key === 'function' ? key('+972545543107') : 'not lifted');
ck('phoneKey STILL recognises a national-format number, where toE164 refuses it',
   typeof key === 'function' && key('0545543107') === '545543107'
     && f('0545543107') === '');
ck('...which is the whole point: recognising is not dialling',
   typeof key === 'function' && key('+972545543107') === key('0545543107'));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (useOld) {
  console.log(fail > 0
    ? '  CONTROL OK — the baseline fails, so the checks above measure the fix.\n'
    : '  CONTROL BROKEN — the baseline PASSES. These checks measure nothing.\n');
  process.exit(fail > 0 ? 0 : 1);
}
process.exit(fail ? 1 : 0);
