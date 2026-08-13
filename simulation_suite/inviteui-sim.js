// inviteui-sim.js — THE INVITATION MUST BE VISIBLE (v0.61.0).
//
// yuval tapped a WhatsApp invite from dan and got a login form asking for a
// code he had never been sent. My first diagnosis — "the receiving half is
// absent" — WAS WRONG: boot() does capture ?join=, stores it, and it IS
// consumed after sign-in. The plumbing was fine.
// What was missing is CONTEXT. The invitation was invisible at the one moment
// it mattered, so a stranger's first ever contact with Trustnet was an
// unexplained code field. dan's wording, verbatim:
//   "dan is inviting you to his ski circle he values your recommendations"
const fs = require('fs'), vm = require('vm');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const mig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0032_invite_preview.sql', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the anonymous lookup ────────────────────────────────────────────────────
ck('invite_preview exists', /create or replace function public\.invite_preview/.test(mig));
ck('...and is callable by an ANONYMOUS visitor (they have not signed in yet)',
   /grant execute on function public\.invite_preview\(text\) to anon, authenticated/.test(mig));
ck('it returns ONLY the inviter and the circle',
   /jsonb_build_object\(\s*\n?\s*'ok', true,\s*\n?\s*'inviter'[\s\S]{0,90}'circle',  v_circle\.name\s*\n?\s*\);/.test(mig));
ck('...the inviter as a FIRST NAME, not a full identity',
   /split_part\(coalesce\(name, ''\), ' ', 1\)/.test(mig));
ck('a REVOKED link stops resolving', /where token = p_token and active = true/.test(mig));
ck('unknown and revoked are INDISTINGUISHABLE to a prober',
   (mig.match(/'reason', 'invalid'/g) || []).length === 2);
['member', 'email', 'phone', 'recommendation'].forEach(function (leak) {
  ck('it leaks no ' + leak + ' data', !new RegExp(leak, 'i').test(
    mig.slice(mig.indexOf('return jsonb_build_object(\n    \'ok\', true'), mig.indexOf('$$;'))));
});

// ── the banner ──────────────────────────────────────────────────────────────
ck('the login screen has a place for the invitation', /id="login-invite"/.test(web));
ck('...ABOVE the sign-in heading, not below it',
   web.indexOf('id="login-invite"') < web.indexOf('Sign in to Trustnet'));
ck('the banner is resolved before sign-in', /showInviteBannerIfPending\(\);/.test(web));
ck("dan's wording: X is inviting you to his Y circle",
   /is inviting you to his ' \+ esc\(d\.circle\) \+ ' circle/.test(web));
ck('...and the second line', /He values your recommendations\./.test(web));
ck('WhatsApp is preselected — the code arrives on the phone he is holding',
   /const waTab = document\.getElementById\('login-tab-wa'\);[\s\S]{0,60}waTab\.click\(\)/.test(web));
ck('a dead link says so plainly instead of half a sentence',
   /That invitation link is no longer valid/.test(web));
ck('...and does NOT strand them — they can still sign in',
   /You can still sign in below/.test(web));
ck('a failed lookup never blocks sign-in',
   /catch \(e\) \{[\s\S]{0,140}host\.style\.display = 'none';/.test(web));

// ── the sweep gained the same from_name the direct path got ─────────────────
// v0.60.1 gave DIRECT sends a from_name and left the sweep with the same gap,
// so dan saw THREE cards saying "This arrived without a sender" at once.
// Fixing one producer and not its twin is the exact mistake the seam audit
// exists to stop.
const sweep = fs.readFileSync('/home/claude/fx-out/supabase/functions/suggest-sweep/index.ts', 'utf8');
ck('the sweep now carries the contributor name', /from_name: \(c\.contributor_user \? nameOfUser/.test(sweep));
ck('...falling back to the member row name', /\|\| m\.name \|\| null/.test(sweep));
ck('...and its query error is checked like every other',
   /users_query_failed/.test(sweep));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
