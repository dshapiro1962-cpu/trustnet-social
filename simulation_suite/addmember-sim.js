// addmember-sim.js — SEARCH FIRST, CONTACT DECIDES (v0.45.0).
//
// THE MESS dan REPORTED: added shapiro (already on Trustnet) -> app said it
// couldn't add him, filed him under "not on Trustnet", offered an invite
// toggle, and the invite email said he had JOINED. Added dan by phone+email ->
// member created with EMPTY details.
// CAUSES: (a) the dialog was FORM-FIRST, so problems surfaced after typing;
// (b) its default method "In-app" stored NO CONTACT AT ALL — the friendliest
// option made an unusable record; (c) duplicates were decided from
// AppState.userMembers, a browser cache, ending in `norm(x.name)===norm(name)`
// — name equality, which dan's rule forbids; (d) the link RPC threw on every
// phone lookup and the client swallowed it, so a CRASH looked like "stranger".
const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── search-first ────────────────────────────────────────────────────────────
ck('the dialog opens on a SEARCH pane, not a form', /id="nm-search-pane"/.test(web));
ck('the form is hidden until needed when adding',
   /id="nm-form-pane" style="display:' \+ \(editId \? 'block' : 'none'\)/.test(web));
ck('editing skips the search and goes straight to the form',
   /const searchPane = editId \? '' :/.test(web));
ck('there is an explicit "add someone new" escape', /data-action="add-new-person"/.test(web));
ck('what you typed carries into the name field', /if \(nameEl && typed && !nameEl\.value\) nameEl\.value = typed;/.test(web));
ck('the Add button stays hidden until the form shows',
   /id="nm-save-btn"[\s\S]{0,120}display:' \+ \(editId \? 'inline-flex' : 'none'\)/.test(web));

// ── results show DETAILS so the human chooses ───────────────────────────────
ck('each result shows every contact', /function contactLine\(contacts\)/.test(web));
ck('a person with no contact is flagged, not hidden',
   /no contact \\u2014 add one to invite/.test(web));
ck('results show Trustnet status', /on Trustnet<\/span>/.test(web));
ck('results show which circles they are in', /in ' \+ esc\(circleNames\)/.test(web));
ck('someone already in THIS circle is shown but not selectable',
   /inThis \? ' disabled' : ''/.test(web));
ck('picking a known person needs no form at all', /data-action="pick-person"/.test(web));

// ── the contactless option is gone ──────────────────────────────────────────
ck('"In-app" is no longer an offered contact method',
   !/\{ value: 'app',\s+icon/.test(web));
ck('the default method is a real contact, not In-app', /: 'whatsapp'\);/.test(web));
ck('the contact field is always shown (a contact IS the identity)',
   /const emContactVisible = !em \|\| !em\.isExternalSource;/.test(web));

// ── identity decided by the SERVER, on the CONTACT ──────────────────────────
ck('the stale in-memory duplicate scan is gone',
   !/return norm\(x\.name\) === norm\(name\);/.test(web));
ck('resolveContact is called before creating anything',
   /resolved = await resolveContact\(method, contact, circleId\)/.test(web));
ck('it uses sb.rpc, not a non-existent edge function',
   /sb\.rpc\('resolve_contact'/.test(web) && !/fnPost\('rpc:/.test(web));
ck('an RPC error is THROWN, not turned into a falsy answer',
   /if \(r\.error\) throw new Error\(r\.error\.message \|\| 'resolve_contact failed'\)/.test(web));
ck('a resolution failure ABORTS the add — never "assume stranger"',
   /Couldn't check whether they're already known\. Nothing was added/.test(web));
ck('in_circle is reported and stops the add', /if \(resolved\.state === 'in_circle'\)/.test(web));
ck('found_person ASKS before merging (dan\'s rule)',
   /if \(resolved\.state === 'found_person'\)[\s\S]{0,900}confirm\(/.test(web));
// v0.46.1: the prompt must name the CONTACT and state that the TYPED NAME LOSES.
// dan typed "yoram" with dan test2's email and was told only "dan test2 already
// exists" — no way to see the email was the reason, and no warning that the add
// would create dan test2 rather than yoram.
ck('the prompt names the contact that is taken', /contact \+ ' is already in use by/.test(web));
ck('the prompt says the contact decides who someone is', /because the contact decides who someone is/.test(web));
ck('the contact holder\'s name overrides what was typed', /name = holder;/.test(web));
ck('declining the merge adds NOTHING', /Nothing added\. Use a different /.test(web));

// ── the person model is actually used ───────────────────────────────────────
ck('an existing person is reused rather than duplicated', /existingPersonId = resolved\.person_id;/.test(web));
// v0.68.0 — INVERTED. These asserted that the client inserted people and
// person_contacts itself. 0038 makes a contact globally unique (one phone or
// email is one human across the whole app), so that insert failed with a
// duplicate key for any contact another account already knew. Identity is now
// derived by trg_member_identity on every write from every source, and the
// client doing it too was the last copy of the rule outside the shared one.
ck('the client does NOT insert people rows', !/sb\.from\('people'\)\.insert\(/.test(web));
ck('...nor person_contacts rows', !/sb\.from\('person_contacts'\)\.insert\(/.test(web));
ck('...and computes no contact key in JavaScript',
   !/key:\s*method === 'whatsapp'/.test(web));
// v0.46.0: the hand-written save list is GONE. person_id now travels via the
// single MEMBER_FIELDS map, so it CANNOT reach save without also reaching load
// — which is precisely the asymmetry that nulled 14 person links.
ck('person_id is persisted via the shared field map',
   /\['person_id',\s*'personId'/.test(web) && /const rows = arr\.map\(memberToRow\);/.test(web));
// The invariant this protected — never save a member nobody can reach — still
// holds, but it is enforced earlier and harder: buildMember refuses a missing
// method, and 0037 removed 'app' from the contact_method check constraint so
// the database rejects it too.
ck('an unreachable member is still refused before anything is saved',
   /no_contact_method/.test(web));

// ── errors surface everywhere, never silently ───────────────────────────────
ck('search failure shows a message instead of an empty list',
   /Could not search your people\. Check your connection/.test(web));
ck('adding an existing person surfaces its error', /Could not add them: /.test(web));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
