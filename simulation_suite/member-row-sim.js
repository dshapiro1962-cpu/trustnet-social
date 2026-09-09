// member-row-sim.js — a member's name must never be squeezed into a column of
// single letters.
//
// THE FAILURE, dan's phone 9 Sep 2026, Travel circle, v0.84.0:
//
//     m                        + 9
//     a                        7 2
//     y                        5 4
//     s      [On Trustnet]     8 8   [On Trustnet]
//     h      [WhatsApp] ●      2 0   [WhatsApp]
//     a                        6 3
//     p
//     ...
//
// Five badges sit to the right of every member — On Trustnet, the channel
// chip, the response dot, edit, remove — and .member-badges is flex-shrink:0,
// so on a phone they are already wider than the row and take what they need.
// .member-info was the only flexible item, so it absorbed the entire shortfall
// and collapsed to about one character. .member-name had no white-space rule,
// so the text wrapped inside that one-character box, one letter per line.
//
// Its sibling .member-sub has always carried nowrap + ellipsis, which is why
// the subtitle degraded gracefully and the name did not. Same row, two
// different treatments, and only one of them survived a narrow screen.
//
// This is a CSS RULE CHECK and says so: there is no browser here, so it reads
// the declarations rather than measuring a rendered box. What it can prove is
// that every property the failure depended on has been dealt with.
//
//   node member-row-sim.js         → must PASS
//   node member-row-sim.js --old   → index.pre-v0.86.0.html, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.86.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const html = fs.readFileSync(file, 'utf8');
const rule = (sel) => {
  const i = html.indexOf('\n' + sel + ' {');
  if (i < 0) return '';
  return html.slice(i, html.indexOf('}', i) + 1);
};

const row = rule('.member-row');
const info = rule('.member-info');
const name = rule('.member-name');
const sub = rule('.member-sub');
const badges = rule('.member-badges');

console.log('\n-- the name cannot be squeezed to nothing --\n');

ck('the row still exists to be checked', !!row && !!info && !!name);

// THE FLOOR. `min-width: 0` is what allowed the collapse: it tells the browser
// this item may shrink past its content, all the way to zero.
ck('the name column has a floor, not min-width:0',
   /min-width:\s*140px/.test(info) && !/min-width:\s*0\b/.test(info),
   'min-width:0 is precisely what let it collapse to one character');
ck('...and it can still grow to fill the row',
   /flex:\s*1 1 auto/.test(info), info.replace(/\s+/g, ' '));

// THE WRAP. Without nowrap, a narrow box wraps per character.
ck('the name never wraps', /white-space:\s*nowrap/.test(name),
   'this is what turned "may shapiro" into a column of letters');
ck('...it truncates instead',
   /overflow:\s*hidden/.test(name) && /text-overflow:\s*ellipsis/.test(name));

// THE ESCAPE VALVE. Something has to give when the badges do not fit, and it
// must not be the name.
ck('the row may wrap, so the badges can leave line one',
   /flex-wrap:\s*wrap/.test(row), 'otherwise the only thing that can give is the name');
ck('the badges may wrap among themselves too',
   /flex-wrap:\s*wrap/.test(badges));

console.log('\n-- what must not change --\n');

// REGRESSION GUARDS. True before and after: the badges keeping their size is
// correct — a chip that shrinks is unreadable. The bug was never that they
// refuse to shrink; it was that nothing else was allowed to give.
ck('[regression] the badges still keep their size', /flex-shrink:\s*0/.test(badges));
ck('[regression] the subtitle keeps the treatment it always had',
   /white-space:\s*nowrap/.test(sub) && /text-overflow:\s*ellipsis/.test(sub));
ck('[regression] the row is still a flex row with its gap',
   /display:\s*flex/.test(row) && /gap:\s*12px/.test(row));

console.log('\n  ' + (useOld ? 'BASELINE v0.85.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
