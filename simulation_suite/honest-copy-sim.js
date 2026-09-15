// honest-copy-sim.js — three places where the app said something that was not
// so, and the assertions that stop them coming back.
//
// All three were confirmed against the LIVE v0.91.1 source on 14 Sep 2026, two
// of them after Tal Shapiro reviewed the app and named them. For a product
// called Trustnet, telling a user something untrue is the most expensive
// possible defect: it costs exactly the thing the name claims.
//
//   1. "Request introduction" reported success for something that never
//      happened. The handler was one line - a toast saying they would be
//      notified anonymously. No network call, no row, nobody notified. A person
//      tapped it and waited for an introduction no part of the system knew had
//      been asked for. taste_matches and taste_match_profiles are both empty,
//      so there was nowhere to record it even in principle.
//
//   2. The Sign out helper text read "Removes your profile, circles, members,
//      recommendations and queries". handleClearData calls sb.auth.signOut()
//      and reloads. Nothing is deleted. The copy described an earlier intention
//      and outlived it. It failed one way only: someone wanting to sign out on
//      a shared phone read it and did not dare.
//
//   3. The invitation was hardcoded male - "X is inviting you to HIS circle"
//      and "HE values your recommendations" - for every inviter. Roughly half
//      of dan's beta invitees are women, and this is the first sentence a
//      stranger reads about Trustnet. invite_preview returns a name and never a
//      gender, so there is nothing to infer from.
//
// These are assertions about COPY, which is unusual for this suite, so they are
// written to fail for the right reason: each checks the specific false claim is
// absent AND that something truthful stands in its place. A file with the
// sentence merely deleted would pass the first half and fail the second.
//
//   node honest-copy-sim.js         → must PASS
//   node honest-copy-sim.js --old   → index.pre-v0.93.0.html, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.93.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const src = fs.readFileSync(file, 'utf8');
// Strip line comments so a claim quoted in a comment - as every one of these
// now is, to record what it used to say - cannot satisfy or break a check.
const live = src.replace(/^\s*\/\/[^\n]*$/gm, '');

console.log('\n   fixture: ' + path.basename(file) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1. THE INTRODUCTION THAT WAS NEVER REQUESTED ─────────────────────────
console.log('== "Request introduction" ==\n');
ck('it no longer claims anyone will be notified',
   !/Introduction requested/.test(live),
   'the toast asserted a notification that no code sends');
ck('...and does not say "notified anonymously" anywhere in live code',
   !/notified anonymously/.test(live));
ck('it says plainly that nothing was sent',
   /nothing has been sent/i.test(live),
   'removing the lie is half the job; the person still pressed a button');
ck('and it is a warning, not a success',
   /Introductions are not available yet[^)]*'warn'/.test(live)
   || /nothing has been sent[^)]*'warn'/.test(live),
   'a green success toast for "it did not happen" is the same bug in a new colour');

// ── 2. THE SIGN OUT THAT DELETED NOTHING ────────────────────────────────
console.log('\n== Sign out ==\n');
ck('the copy no longer describes a deletion',
   !/Removes your profile, circles, members/.test(live),
   'handleClearData signs out and reloads; it removes nothing');
ck('it describes what the button actually does',
   /Signs you out on this device/.test(live));
ck('...and says the data stays',
   /stay exactly as they are/.test(live),
   'the failure was people not daring to press it');
// The attribute quoting is double, not single - the first version of this
// assertion looked for '>Sign out and failed on correct code.
ck('the button is no longer styled as destructive',
   !/btn-danger[^>]*>Sign out/.test(live)
   && /btn-secondary[^>]*>Sign out/.test(live),
   'btn-danger on a harmless action is the same false claim in CSS');

// ── 3. THE INVITATION THAT ASSUMED A MAN ────────────────────────────────
console.log('\n== the invitation ==\n');
ck('it does not say "his" about an inviter it knows nothing about',
   !/inviting you to his /.test(live),
   'hardcoded for every inviter, half of whom are women');
ck('it does not say "He values"',
   !/'He values your recommendations/.test(live));
ck('it uses a pronoun that is true of anyone',
   /inviting you to their /.test(live));
ck('...in both sentences',
   /They value your recommendations/.test(live),
   'fixing one line and leaving the next is worse than fixing neither');
// The name is escaped, the pronoun is not a guess: prove the source of truth
// carries no gender to infer from.
ck('and nothing in the invite path reads a gender field',
   !/\bgender\b/i.test(live),
   'if one ever appears, this assertion should be revisited deliberately');

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
