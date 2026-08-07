// staleness-sim.js — NEVER DECIDE IDENTITY FROM STALE MEMORY (v0.47.0).
//
// THE FAILURE: modalInvite is SYNCHRONOUS and bucketed purely from
// AppState.userMembers — zero server calls. It showed whatever the browser last
// loaded, which is how a LINKED person appeared under "not on Trustnet" and was
// emailed an invite saying he had joined a circle he was already in.
// AND: link_member_to_existing_user queried auth.users.phone — A COLUMN THAT
// DOES NOT EXIST — so every whatsapp lookup threw, the caller caught it, and
// "the check crashed" was reported to the user as "no account".
const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };
const code = web.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

// ── item 4: the broken function is retired ─────────────────────────────────
ck('link_member_to_existing_user is no longer CALLED anywhere',
   !/sb\.rpc\('link_member_to_existing_user'/.test(code));
ck('the recheck button now uses resolveContact', /const r = await resolveContact\(m\.contactMethod, m\.contactValue, m\.circleId\)/.test(code));
ck('the redundant second lookup in the save path is gone',
   (code.match(/resolveContact\(/g) || []).length >= 2
   && !/lr = await sb\.rpc/.test(code));

// A failed check must NEVER be reported as "no account" — the whole family.
ck('the recheck counts failures separately', /let found = 0, failed = 0;/.test(code));
ck('...and says so instead of claiming nobody has an account',
   /could not be checked/.test(code));
ck('"None of them have Trustnet accounts" only when NOTHING failed',
   /failed\s*\?[\s\S]{0,400}None of them have Trustnet accounts yet/.test(code));

// ── item 5: the invite dialog refreshes before it renders ──────────────────
ck('there is a refreshing opener for the invite dialog', /async function openInviteFresh/.test(code));
ck('it reloads from the server first', /await loadUserData\(\);/.test(code.slice(code.indexOf('openInviteFresh'), code.indexOf('openInviteFresh') + 700)));
ck('a refresh failure still opens the dialog (never blocks the user)',
   /openModal\('invite', params\);/.test(code.slice(code.indexOf('openInviteFresh'), code.indexOf('openInviteFresh') + 900)));
ck('...but warns the statuses may be out of date',
   /statuses below may be out of date/.test(code));
const direct = (code.match(/openModal\('invite'/g) || []).length;
ck('exactly ONE openModal(\'invite\') remains — inside the refreshing opener',
   direct === 1, direct + ' found');
ck('every entry point goes through the refresh',
   (code.match(/openInviteFresh\(/g) || []).length >= 4);

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
