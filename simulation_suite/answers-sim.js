// answers-sim.js — ANSWERS MUST BE ENRICHED TOO (v0.59.0).
//
// THE GAP: receive-response created a canonical for every answer via
// match_canonical and NEVER enriched it. No kind, no tags, no search document.
// Two consequences, both real in dan's data:
//   * the shared-interest sweep skips anything without a kind, so 61 of his 114
//     contributions could never match anyone. ANSWERS ARE THE RICHEST CONTENT
//     IN TRUSTNET and were the one shape that could not spread.
//   * the item stayed invisible to library search until someone saved it.
const fs = require('fs');
const F = '/home/claude/fx-out/supabase/functions/';
const recv = fs.readFileSync(F + 'receive-response/index.ts', 'utf8');
const lib  = fs.readFileSync(F + 'librarian/index.ts', 'utf8');
const core = fs.readFileSync(F + '_shared/enrich_core.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

ck('receive-response enriches the answer', /await enrichOne\(key, \{/.test(recv));
ck('...using the SHARED enrichment, not its own', /from "\.\.\/_shared\/enrich_core\.ts"/.test(recv));

// ORDER: the answer must be durable BEFORE enrichment is attempted.
const iWrite = recv.indexOf('.eq("response_token", body.token);');
const iEnrich = recv.indexOf('ENRICH THE ANSWER');
ck('the answer is SAVED before enrichment is attempted', iWrite > 0 && iEnrich > iWrite,
   'write@' + iWrite + ' enrich@' + iEnrich);
ck('enrichment failure cannot lose the answer (caught, logged, not thrown)',
   /catch \(e\) \{[\s\S]{0,220}response already saved/.test(recv));
ck('...and a failed WRITE is logged rather than swallowed',
   /answer enrichment write failed:/.test(recv));

ck('only unenriched canonicals are worked on (a matched one is usually done)',
   /!existing\?\.kind \|\| !existing\?\.search_doc/.test(recv));
ck('the QUESTION goes into the enrichment — it is evidence',
   /query_text: query\?\.text \?\? ""/.test(recv));
ck('the answerer\'s note goes in too', /note: body\.rec_note\?\.trim\(\) \?\? ""/.test(recv));

// ── ONE definition of what an enrichment writes ─────────────────────────────
ck('enrichmentPatch is defined once, in the shared core',
   /export function enrichmentPatch/.test(core));
ck('...and nowhere else',
   !/function enrichmentPatch/.test(recv) && !/function enrichmentPatch/.test(lib));
ck('the librarian COMMIT path uses it', /const patch = enrichmentPatch\(e, vec\);/.test(lib));
ck('the librarian BACKFILL path uses it too',
   (lib.match(/enrichmentPatch\(e, vec\)/g) || []).length === 2,
   (lib.match(/enrichmentPatch\(e, vec\)/g) || []).length + ' uses');
ck('receive-response uses it', /enrichmentPatch\(e, vec\)/.test(recv));
ck('no path spells the columns out by hand any more',
   !/kind: e\.kind \|\| null,\s*\n\s*search_doc: e\.search_doc/.test(lib));

// the patch itself must carry every column the feature depends on
const patchFn = core.slice(core.indexOf('export function enrichmentPatch'),
                           core.indexOf('// ═══ THE INTEREST VOCABULARY'));
['kind', 'search_doc', 'ai_tags', 'primary_category', 'verified'].forEach(f =>
  ck('the shared patch writes ' + f, new RegExp('\\b' + f + ':').test(patchFn)));
ck('...and the embedding only when there is one', /if \(vec\) patch\.embedding = vec;/.test(patchFn));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
