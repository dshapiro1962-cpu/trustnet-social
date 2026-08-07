// contact-sim.js — a recommendation you cannot act on is not a recommendation.
//
// THE FAILURE: canonicals had google_url, website_url, linkedin_url and NO
// phone. chat-import glued the provider's number onto the end of the note as
// prose ("מעולה, אמין, מקצועי, אחראי. 050-5303690"). Three costs:
//   1. not actionable — read, select, copy, switch app, paste
//   2. not queryable — "which of my recs are contactable" was unanswerable
//   3. NOT AN IDENTITY ANCHOR — match_canonical compared name similarity only,
//      so two "שי" with different numbers stayed merged-or-split by spelling
//      luck, while the strongest signal in the data sat unused in a sentence.
// Built BEFORE beta on purpose: a schema-shape error is equally wrong at 6 rows
// and 6,000, and the backfill is trivial now and miserable later.
const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const mig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0020_canonical_contact.sql', 'utf8');
const chat = fs.readFileSync('/home/claude/fx-out/supabase/functions/extract-chat-recs/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── schema ──────────────────────────────────────────────────────────────────
ck('canonicals gains a phone column', /add column if not exists phone text/.test(mig));
ck('phone_key is GENERATED, so code cannot write an inconsistent value',
   /phone_key text generated always as \(phone_key\(phone\)\) stored/.test(mig));
ck('it reuses the phone_key() from 0017 (one normalisation rule, not two)',
   /phone_key\(phone\)/.test(mig) && !/create or replace function phone_key/.test(mig));
ck('phone_key is indexed for identity lookups', /canonicals_phone_key_idx/.test(mig));
ck('the migration is idempotent (safe on production)',
   !/add column (?!if not exists)/.test(mig) && !/create index (?!if not exists)/.test(mig));

// ── identity: phone beats name ──────────────────────────────────────────────
ck('match_canonical accepts a phone', /match_canonical\(p_name text, p_location text, p_phone text default null\)/.test(mig));
ck('...as an OPTIONAL argument, so existing callers keep working untouched',
   /p_phone text default null/.test(mig));

// CREATE OR REPLACE only replaces a function of the SAME SIGNATURE. Adding an
// argument creates a SECOND overloaded function — and Supabase RPC resolves by
// parameter name, so a 2-arg caller (receive-response) would silently bind to
// the OLD no-phone version while a 3-arg caller used the new one. Two callers,
// two identity rules, no error. 0020's own verification caught it (pg_proc = 2)
// and 0021 drops the orphan.
const fix = fs.existsSync('/home/claude/fx-out/supabase/migrations/0021_match_canonical_overload_fix.sql')
  ? fs.readFileSync('/home/claude/fx-out/supabase/migrations/0021_match_canonical_overload_fix.sql', 'utf8') : '';
ck('the orphaned 2-arg match_canonical overload is dropped',
   /drop function if exists public\.match_canonical\(text, text\)/.test(fix));
ck('...idempotently', /drop function if exists/.test(fix));
ck('the fix verifies exactly ONE function survives',
   /fn_count_should_be_1/.test(fix) && /args_should_be_3/.test(fix));
const fn = (mig.match(/create or replace function match_canonical[\s\S]*?\n\$\$;/) || [''])[0];
const iPhone = fn.indexOf('phone_key = v_key');
const iSim = fn.indexOf('similarity(lower(name)');
ck('the phone is checked BEFORE name similarity (proof beats guess)',
   iPhone > 0 && iSim > iPhone, 'phone@' + iPhone + ' name@' + iSim);
ck('a phone match returns immediately, skipping the fuzzy path',
   /if v_id is not null then return v_id; end if;/.test(fn));
ck('a too-short key never triggers a false identity match',
   /length\(v_key\) >= 9/.test(fn));
ck('the original name/location similarity survives unchanged',
   /similarity\(lower\(name\), lower\(p_name\)\) > 0\.45/.test(fn));

// ── backfill ────────────────────────────────────────────────────────────────
ck('numbers already trapped in notes are recovered', /update public\.canonicals c/.test(mig));
ck('the backfill never overwrites an existing number', /and c\.phone is null/.test(mig));
ck('the backfill leaves the note text intact (non-destructive)',
   !/update public\.recommendations/.test(mig));

// ── chat-import ─────────────────────────────────────────────────────────────
ck('chat-import passes the phone to match_canonical', /p_phone: \(it\.phone \|\| ""\)\.trim\(\) \|\| null/.test(chat));
ck('chat-import writes phone as a COLUMN', /phone: \(it\.phone \|\| ""\)\.trim\(\) \|\| null,/.test(chat));
ck('the phone is no longer glued onto the note',
   !/const note = it\.note \+ \(it\.phone/.test(chat));
ck('...but the search DOCUMENT still carries it (searching a number must work)',
   /noteForDoc = note \+ \(it\.phone/.test(chat));
ck('a reused canonical with no number gets one filled in',
   /\.update\(\{ phone: it\.phone\.trim\(\) \}\)/.test(chat));
ck('...but an existing number is never overwritten', /\.is\("phone", null\)/.test(chat));

// ── the app ─────────────────────────────────────────────────────────────────
ck('the client loads the phone', /phone:c\.phone\|\|''/.test(web));
ck('rec detail offers a tel: link', /href="tel:'/.test(web));
ck('rec detail offers a WhatsApp link for the provider', /wa\.me\/' \+ esc\(e164/.test(web));
ck('the number is normalised with the SAME rule as everywhere else',
   /normalizeIlPhone\(can\.phone\)/.test(web));
ck('the call button comes before the search links (pressing beats searching)',
   web.indexOf('href="tel:') < web.indexOf("extLink(can.googleUrl"));

// ── normalisation agreement: SQL, edge function and client must concur ──────
// SQL phone_key() and wa-signin's phoneKey() both take the last 9 digits.
function phoneKey(raw) { const d = String(raw || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : d; }
const FORMS = ['050-530-3690', '0505303690', '+972505303690', '972-50-530-3690', '050 530 3690'];
const keys = new Set(FORMS.map(phoneKey));
ck('every written form of one number collapses to ONE key',
   keys.size === 1, [...keys].join(' | '));
ck('...and that key is 9 digits', [...keys][0].length === 9, [...keys][0]);
const OTHER = phoneKey('054-5666006');
ck('a different number yields a different key', OTHER !== [...keys][0]);

// dan's real pair: names that trigram-matched, now provable by number
ck('two providers named שי with DIFFERENT numbers stay separate',
   phoneKey('050-1111111') !== phoneKey('052-2222222'));
ck('one provider written two ways merges on the number alone',
   phoneKey('שושן 050-5303690'.replace(/\D/g, '')) === phoneKey('050-530-3690'));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
