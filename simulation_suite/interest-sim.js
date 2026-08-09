// interest-sim.js — THE INTEREST VOCABULARY (v0.48.0).
//
// Shared-interest suggestions need ONE comparable value on both sides: what X's
// item IS, and what my circle is ABOUT. The enricher's `kind` is precise but
// free-form; this maps it onto a fixed list.
//
// WHY A LIST AND NOT A SIMILARITY SCORE: every trust decision here must be
// explainable in one sentence. "Rina answered this, she's in your reading
// circle, and it's a book" is checkable. "0.83 similarity" is not.
//
// THE TRAPS BELOW ARE REAL BUGS FROM THIS PROJECT: substring matching is what
// put a dermatologist ("skin") on the "ski" results screen for a week.
const fs = require('fs');
const core = fs.readFileSync('/home/claude/fx-out/supabase/functions/_shared/enrich_core.ts', 'utf8');
const lib  = fs.readFileSync('/home/claude/fx-out/supabase/functions/librarian/index.ts', 'utf8');
const mig  = fs.readFileSync('/home/claude/fx-out/supabase/migrations/0026_shared_interest.sql', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── kind must be PERSISTED — the enabling change ────────────────────────────
ck('canonicals.kind column is added', /add column if not exists kind text/.test(mig));
ck('the librarian writes kind on COMMIT', (lib.match(/kind: e\.kind \|\| null/g) || []).length >= 1);
ck('...and on BACKFILL too (repairs must not blank it)',
   (lib.match(/kind: e\.kind \|\| null/g) || []).length === 2,
   (lib.match(/kind: e\.kind \|\| null/g) || []).length + ' writes');

// ── the answer dialog gets its own opt-out ──────────────────────────────────
ck('query_responses gains shared_to_network',
   /alter table public\.query_responses[\s\S]{0,140}shared_to_network boolean not null default true/.test(mig));
ck('...defaulting TRUE, because the feature is automatic and the toggle opts OUT',
   /default true/.test(mig));

// ── circle interests ────────────────────────────────────────────────────────
ck('circle_interests table exists', /create table if not exists public\.circle_interests/.test(mig));
ck('a circle may hold SEVERAL interests (unique on circle+interest, not circle)',
   /circle_interests_uniq[\s\S]{0,120}\(circle_id, interest\)/.test(mig));
ck('declined is stored, so a silent circle differs from an unasked one',
   /check \(source in \('confirmed','declined'\)\)/.test(mig));
ck('circle_interests is owner-scoped by RLS', /create policy circle_interests_owner/.test(mig));

// ── the dead flag goes ──────────────────────────────────────────────────────
ck('degree2_enabled is dropped (default true, read by nothing)',
   /alter table public\.users drop column if exists degree2_enabled/.test(mig));
ck('...and the reason is recorded, not just the action',
   /LOOKS meaningful and is not/.test(mig.replace(/\n--/g, '')));

// ── the vocabulary itself ───────────────────────────────────────────────────
ck('interestsForKind is exported', /export function interestsForKind/.test(core));
ck('the vocabulary is a declared closed list', /export const INTERESTS = \[/.test(core));
ck('matching is WHOLE-WORD, not substring',
   /k\.indexOf\(" " \+ t \+ " "\) >= 0/.test(core));
ck('...and the reason is named in the code',
   /"ski" must not match "skin"/.test(core));
ck('an unmapped kind returns nothing rather than guessing',
   /if \(k\.trim\(\) === ""\) return \[\];/.test(core));
ck('ski also counts as a destination (one item, two possible circles)',
   /ALSO: Record<string, string\[\]> = \{ ski: \["destination"\] \}/.test(core));

// ── behavioural: run the real function ──────────────────────────────────────
// Run the REAL function, not a copy. Extract the source block and strip the
// TypeScript annotations — testing a reimplementation would prove nothing.
const blockStart = core.indexOf('const KIND_MAP');
const blockEnd = core.indexOf('export async function webGround');
let js = core.slice(blockStart, blockEnd)
  .replace(/export /g, '')
  .replace(/Array<\[string\[\], string\[\]\]>/g, '')
  .replace(/Record<string, string\[\]>/g, '')
  .replace(/new Set<string>\(\)/g, 'new Set()')
  .replace(/\(kind: string\): string\[\]/g, '(kind)')
  .replace(/: string\[\]/g, '')
  .replace(/: string/g, '')
  .replace(/const KIND_MAP\s*:\s*=/, 'const KIND_MAP =')
  .replace(/const ALSO\s*:\s*=/, 'const ALSO =');
let fn;
try { fn = new Function(js + '; return interestsForKind;')(); }
catch (e) { fn = null; }
ck('the real function could be extracted and run', typeof fn === 'function',
   fn ? '' : 'extraction failed — the test would be meaningless');
if (typeof fn !== 'function') { console.log('\nRESULT: ' + pass + ' passed, ' + (fail) + ' failed'); process.exit(0); }
const has = (k, want) => fn(k).includes(want);

ck('BEHAVIOUR: "novel" -> book (dan\'s The White Tiger case)', has('novel', 'book'));
ck('BEHAVIOUR: "children\'s book" -> book', has("children's book", 'book'));
ck('BEHAVIOUR: "ski resort" -> ski AND destination',
   has('ski resort', 'ski') && has('ski resort', 'destination'));
ck('TRAP: "skin doctor" is NOT ski', !has('skin doctor', 'ski'), fn('skin doctor').join(','));
ck('TRAP: "skin doctor" IS a doctor', has('skin doctor', 'doctor'));
ck('TRAP: "barber" is NOT a bar', !has('barber', 'bar'), fn('barber').join(','));
ck('TRAP: "bookkeeper" is NOT a book', !has('bookkeeper', 'book'), fn('bookkeeper').join(','));
ck('HEBREW: "רופא עור" -> doctor', has('רופא עור', 'doctor'));
ck('HEBREW: "ספר" -> book', has('ספר', 'book'));
ck('unknown kind matches NOTHING', fn('quantum flux capacitor').length === 0);
ck('the "hair removal machine" case never becomes a person',
   !has('hair removal machine', 'doctor') && !has('hair removal machine', 'service'));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
