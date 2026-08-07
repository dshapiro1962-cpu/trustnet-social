// people-sim.js — IDENTITY IS THE CONTACT, NEVER THE NAME (v0.43.0).
//
// THE BUG: members.circle_id is NOT NULL, so a member row belongs to ONE
// circle — "shapiro" in ski and "shapiro" in leros were unrelated rows. And the
// duplicate guard's last test was `norm(x.name) === norm(name)`. So one person
// in seven circles was seven strangers, while three Marks would have collapsed
// into one. dan's rule: the phone, email or linkedin IS the identity; the name
// is only a convenience for finding someone.
const fs = require('fs');
const M = '/home/claude/fx-out/supabase/migrations/';
const p22 = fs.readFileSync(M + '0022_people.sql', 'utf8');
const p23 = fs.readFileSync(M + '0023_dedupe_memberships.sql', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the model ───────────────────────────────────────────────────────────────
ck('people table exists', /create table if not exists public\.people/.test(p22));
ck('person_contacts allows MANY contacts per person',
   /create table if not exists public\.person_contacts/.test(p22) && /person_id  uuid not null/.test(p22));
ck('all three methods are supported', /check \(method in \('email','whatsapp','linkedin'\)\)/.test(p22));
ck('ONE contact can belong to ONE person only (rule 1, enforced by the DB)',
   /create unique index if not exists person_contacts_identity_uniq[\s\S]{0,120}\(owner_id, method, key\)/.test(p22));
ck('the constraint is added AFTER the backfill, not before',
   p22.indexOf('person_contacts_identity_uniq') > p22.indexOf('-- 2. members with NO contact'));

// ── normalisation: ONE rule, reused ─────────────────────────────────────────
ck('contact_key() reuses phone_key() rather than reimplementing it',
   /when p_method = 'whatsapp' then phone_key\(p_value\)/.test(p22));
ck('...and is IMMUTABLE so it can back an index', /returns text language sql immutable/.test(p22));
ck('non-phone contacts are lowercased and trimmed', /else lower\(btrim\(p_value\)\)/.test(p22));

// ── additive, not a rewrite ─────────────────────────────────────────────────
ck('members REMAINS a table (query_responses.member_id + 8 functions depend on it)',
   !/drop table[\s\S]*members/i.test(p22) && /alter table public\.members add column if not exists person_id/.test(p22));
ck('no view replaces members (saveMembers UPSERTs; a view is not writable)',
   !/create (or replace )?view public\.members/i.test(p22));

// ── the backfill groups by CONTACT, never by name ───────────────────────────
ck('grouping key is (owner, method, contact_key) — not the name',
   /group by owner_id, contact_method, public\.contact_key\(contact_method, contact_value\)/.test(p22));
ck('the name is chosen for DISPLAY only, after grouping',
   /array_agg\(name order by cnt desc, last_seen desc\)/.test(p22));
ck('contactless members each get their OWN person (never name-merged)',
   /-- 2\. members with NO contact at all[\s\S]{0,400}get their OWN/.test(p22));
ck('...and the reason is recorded, not assumed',
   /a wrong merge silently fuses two different humans/.test(p22));

// ── RLS ─────────────────────────────────────────────────────────────────────
ck('people has owner-scoped RLS', /create policy people_owner on public\.people/.test(p22));
ck('person_contacts has owner-scoped RLS', /create policy person_contacts_owner/.test(p22));

// ── dedupe: history is never destroyed ──────────────────────────────────────
ck('dan\'s named survivor wins first', /lower\(btrim\(m\.name\)\) = 'shapiro'\) desc/.test(p23));
ck('history breaks the tie next', /coalesce\(qr\.c, 0\) desc/.test(p23));
ck('oldest row is the final tiebreak', /m\.created_at asc/.test(p23));
ck('answers are RE-POINTED to the survivor BEFORE deletion',
   p23.indexOf('update public.query_responses') < p23.indexOf('delete from public.members'));
ck('the run reports what it moved', /re-pointed % responses/.test(p23));
ck('verification proves no orphaned answers remain', /orphaned_responses/.test(p23));

// ── both migrations must be safe to re-run ──────────────────────────────────
[['0022', p22], ['0023', p23]].forEach(([n, s]) => {
  ck(n + ' is idempotent (no unguarded create/add)',
     !/create table (?!if not exists)/i.test(s) && !/add column (?!if not exists)/i.test(s)
     && !/create index (?!if not exists)/i.test(s));
});

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
