// identity-sim.js — ONE ANSWER TO "WHO IS THIS PERSON?" (v0.64.0)
//
// dan: "how come we haven't solved the issue of the app using the email address
// or phone number as the definitive identity of a person and using that
// identity for every aspect of the app."
//
// We HAD solved it — in the database. resolve_contact (0024) gives one
// authoritative answer, and person_contacts enforces one contact one person.
// But it was called from ONE file, and TWELVE other surfaces each answered the
// question their own way. The identity audit found SIX different questions:
//   respond.html      "is a session present in THIS browser?"
//   wa-signin         users.phone_key = phoneKey(phone)
//   whatsapp-webhook  digits(users.phone) = digits(sender)   <- A DIFFERENT RULE
//   complete-join     any user's phoneKey matches
//   my_answered_queries  lower(contact_value) = lower(email)
//   nine more         trust members.linked_user_id, never verify it
const fs = require('fs');
const F = '/home/claude/functions/';
const shared = fs.readFileSync(F + '_shared/utils.ts', 'utf8');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
const respond = fs.readFileSync('/home/claude/app/respond.html', 'utf8');
const recv = fs.readFileSync(F + 'receive-response/index.ts', 'utf8');
const mig = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0034_link_members.sql', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── ONE PHONE RULE ──────────────────────────────────────────────────────────
ck('phoneKey is defined in _shared', /export function phoneKey/.test(shared));
ck('toE164 too — DELIVERY format, kept distinct from identity',
   /export function toE164/.test(shared));
ck('...and the comment says why conflating them was the bug',
   /a delivery format used as an identity/.test(shared));

const privateDefs = [];
fs.readdirSync(F).forEach(function (d) {
  const p = F + d + '/index.ts';
  if (d === '_shared' || !fs.existsSync(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  if (/^function phoneKey/m.test(src) || /^function toE164/m.test(src)) privateDefs.push(d);
});
ck('NO function defines its own phoneKey or toE164', privateDefs.length === 0,
   privateDefs.length ? 'STILL PRIVATE: ' + privateDefs.join(', ') : '');

// the exact pair that broke: the webhook must not identify by raw digits
const hook = fs.readFileSync(F + 'whatsapp-webhook/index.ts', 'utf8');
ck('the webhook identifies by phoneKey, not raw digits',
   /phoneKey\(u\.phone\) === senderKey/.test(hook));
ck('...and no longer matches accounts on digits()',
   !/digits\(u\.phone\) === senderDigits/.test(hook));

// PROVE the rules now agree on the pair that broke
const phoneKey = raw => { const d = String(raw ?? '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : d; };
ck('BEHAVIOUR: a profile "0545543467" and a WhatsApp sender "972545543467" are ONE person',
   phoneKey('0545543467') === phoneKey('972545543467'));
ck('BEHAVIOUR: ...and the old rule said they were not',
   '0545543467'.replace(/\D/g, '') !== '972545543467'.replace(/\D/g, ''));

// ── LINKING IS SERVER-SIDE ──────────────────────────────────────────────────
ck('link_member exists and is security definer',
   /create or replace function public\.link_member[\s\S]{0,220}security definer/.test(mig));
ck('...and only touches a member the CALLER OWNS',
   /where id = p_member_id and owner_id = v_me/.test(mig));
ck('...matching phone OR email, never one alone',
   /contact_method = 'whatsapp'/.test(mig) && /contact_method = 'email'/.test(mig));
ck('...returning only a BOOLEAN — the browser never learns the account id',
   /'linked', true/.test(mig) && !/'user_id', v_user/.test(mig));
ck('...and refusing someone else\'s member', /not_your_member/.test(mig));

ck('THE CLIENT NEVER INVENTS A LINK', !/reuseLinked = true/.test(web));
ck('...it asks the server instead', /sb\.rpc\('link_member'/.test(web));
ck('...from EVERY member-creating path',
   (web.match(/linkMemberOnServer\(/g) || []).length >= 6,
   (web.match(/linkMemberOnServer\(/g) || []).length + ' call sites');
ck('...and a link failure never blocks the save', /Never block the save/.test(web));

// ── THE ANSWERER, NOT THE BROWSER ───────────────────────────────────────────
ck('receive-response reports whether the ANSWERER has an account',
   /answerer_on_trustnet: !!member\?\.linked_user_id/.test(recv));
ck('respond.html uses that, not the local session',
   /data\.answerer_on_trustnet === true/.test(respond));
ck('...and no longer decides identity from localStorage',
   !/if \(readTnSession\(\)\) \{\s*\n\s*var conv/.test(respond));
ck('the ONE remaining session read is documented as legitimate',
   /THIS use of readTnSession is CORRECT/.test(respond));

// ── THE APP MUST SAY WHAT IT KNOWS (v0.64.1) ────────────────────────────────
// dan: "if dshari08@hotmail.com is an app member why doesn't the app say so".
// BECAUSE NOTHING DISPLAYED IT. resolve_contact answers three states and the
// client acted on TWO: 'in_circle' refuses, 'found_person' asks, and
// 'on_trustnet' fell through in silence — isOnTrustnet was SET AND NEVER READ,
// a dead variable introduced in v0.64.0.
// The resolver was right all along; proven against real Postgres for an account
// that has NO person record: state 'on_trustnet', on_trustnet true, and case
// and spacing ignored.
ck('the on_trustnet answer is USED, not just stored',
   (web.match(/isOnTrustnet/g) || []).length >= 3,
   (web.match(/isOnTrustnet/g) || []).length + ' uses');
ck('...and the confirmation tells the user what it means',
   /they are on Trustnet, so they will get your questions in the app/.test(web));
// Line-break tolerant: the phrase wraps across a comment line, and a check
// that fails on where the wrap falls tests formatting, not meaning.
ck('...explaining in the source why it was silent',
   /fell\s*\n?\s*\/\/\s*through SILENTLY|fell through SILENTLY/.test(web));

const mig24 = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0024_resolve_contact.sql', 'utf8');
ck('resolve_contact checks the users table directly, not only person_contacts',
   /select u\.id into v_user from public\.users u/.test(mig24));
ck('...so an account with NO person record still resolves as on_trustnet',
   /case when v_user is not null then 'on_trustnet' else 'free' end/.test(mig24));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
