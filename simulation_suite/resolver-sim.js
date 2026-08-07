// resolver-sim.js — IDENTITY LOOKUP MUST NOT LIE (v0.44.0).
//
// THE FAILURE: link_member_to_existing_user queried auth.users.phone — A COLUMN
// THAT DOES NOT EXIST. Every whatsapp lookup threw; the client caught it, logged
// to a console nobody reads, and continued as if the person were not a user. A
// CRASH AND A GENUINE "NO" WERE INDISTINGUISHABLE. It also checked only the
// method the member was added with, and returned a bare boolean so the caller
// could not tell "not a user" from "could not check". The client then decided
// duplicates from a stale browser cache, falling back to NAME EQUALITY — the
// exact thing dan's rule forbids.
const fs = require('fs');
const sql = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0024_resolve_contact.sql', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── states, not a boolean ───────────────────────────────────────────────────
['found_person', 'in_circle', 'on_trustnet', 'free'].forEach(s =>
  ck('returns the "' + s + '" state', new RegExp("'" + s + "'").test(sql)));
ck('the result is a table of states, not a bare boolean',
   /returns table \([\s\S]{0,200}state\s+text/.test(sql));

// ── the crash that masqueraded as "not a user" ──────────────────────────────
// Strip SQL comments first: the header PROSE names the old bug, and a check
// that explanatory text can break is a check that gets deleted the first time
// it cries wolf. (Same trap as the vector(1536) ordering check in schema-sim.)
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
ck('NEVER queries auth.users.phone (the column does not exist)',
   !/auth\.users[\s\S]{0,80}phone/.test(code));
ck('phone lookup uses users.phone_key, which is real and indexed',
   /u\.phone_key is not null and u\.phone_key = v_key/.test(sql));
ck('bad input RAISES instead of returning a quiet false',
   /raise exception 'bad_method/.test(sql) && /raise exception 'empty_contact'/.test(sql));
ck('an unauthenticated call raises', /raise exception 'not_authenticated'/.test(sql));

// ── one normalisation rule, shared ──────────────────────────────────────────
ck('reuses contact_key() rather than reimplementing normalisation',
   /public\.contact_key\(p_method, p_value\)/.test(sql));
ck('...and does not roll its own regex', !/regexp_replace/.test(sql));

// ── privacy: answer about a contact you already know, never enumerate ───────
ck('a stranger match returns NO person id', /case when v_user is not null then 'on_trustnet' else 'free' end,\s*\n\s*null::uuid, null::text/.test(sql));
ck('every lookup is scoped to the caller', /pc\.owner_id = v_owner/.test(sql));
ck('name search is scoped to the caller only', /p\.owner_id = auth\.uid\(\)/.test(sql));
ck('name search is capped', /limit 25/.test(sql));
ck('execute is granted to authenticated only, not public',
   /revoke all on function public\.resolve_contact/.test(sql) &&
   /grant execute on function public\.resolve_contact\(text, text, uuid\) to authenticated/.test(sql));

// ── dan's rule: ASK, never merge silently ───────────────────────────────────
ck('an existing contact returns the person so the app can ASK',
   /person_name    text/.test(sql) && /'found_person'/.test(sql));
ck('already-in-this-circle is distinguished from merely known',
   /when v_mid is not null then 'in_circle'/.test(sql));

// ── name search returns details so the HUMAN chooses ────────────────────────
ck('search returns every contact per person', /jsonb_build_object\('method', pc\.method, 'value', pc\.value\)/.test(sql));
ck('search returns which circles they are in', /jsonb_build_object\('id', c\.id, 'name', c\.name\)/.test(sql));
ck('search shows Trustnet status', /linked_user_id is not null\) as on_trustnet/.test(sql));

ck('the migration is idempotent', /create or replace function public\.resolve_contact/.test(sql));
console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
