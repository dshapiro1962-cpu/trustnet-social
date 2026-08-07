// grounding-sim.js — EVIDENCE BEFORE WRITING (v0.42.0).
//
// THE FAILURE: the librarian enriched the Hebrew food writer
// "לימור לניאדו תירוש" as kind = "מתכון לקארי hair removal machine". It read
// the question correctly (מתכון = recipe) then invented an English half from
// nothing. temperature is 0 — confident and repeatable, not random.
// CAUSE: the prompt demanded a `kind` and gave no way to decline, and the only
// grounding source was Google Places, which indexes BUSINESSES WITH LOCATIONS
// and can never check an author, a product or a writer. The model guessed and
// nothing could contradict it.
const fs = require('fs');
const core = fs.readFileSync('/home/claude/fx-out/supabase/functions/_shared/enrich_core.ts', 'utf8');
const lib  = fs.readFileSync('/home/claude/fx-out/supabase/functions/librarian/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

ck('a web grounding step exists', /export async function webGround/.test(core));
ck('it uses a search-capable model', /search-preview/.test(core));
ck('...configurable by env without a code change', /GROUNDING_MODEL/.test(core));
ck('the web search tool is actually enabled', /web_search_options/.test(core));
ck('it is told not to speculate', /Do not speculate/.test(core));
ck('it may report NOT FOUND', /NOT FOUND/.test(core));
ck('NOT FOUND is treated as NO evidence', /\/\^NOT FOUND\/i\.test\(txt\)/.test(core));
ck('evidence is length-capped so one page cannot flood the prompt', /slice\(0, 600\)/.test(core));

// ORDER is the whole point: ground, THEN write.
const iGround = core.indexOf('const evidence = key ? await webGround');
const iEnrich = core.indexOf('const ai = key ? await aiEnrich');
ck('grounding runs BEFORE enrichment (was enrich-then-verify)',
   iGround > 0 && iEnrich > iGround, 'ground@' + iGround + ' enrich@' + iEnrich);
ck('the evidence is passed into the enricher', /aiEnrich\(key, \{ \.\.\.input, evidence \}\)/.test(core));
ck('the prompt tells the model evidence OUTRANKS recollection', /OUTRANKS your own/.test(core));
ck('the model is now ALLOWED to leave kind empty', /return kind:\\"\\" and/.test(core));
ck('an empty field is stated to be preferable to a guess', /An EMPTY field is\s*"\s*\+\s*"correct; a plausible guess is not/.test(core.replace(/\n/g,' ')) || /a plausible guess is not/.test(core));
ck('the exact past failure is named in the prompt so it cannot be re-lost',
   /hair removal machine/.test(core));
ck('absence of evidence is stated plainly, not left blank',
   /no web evidence found for this item/.test(core));

// Grounding must never become a new single point of failure.
ck('an HTTP error degrades to empty evidence', /if \(!r\.ok\) return "";/.test(core));
ck('an exception degrades to empty evidence', /catch \(_\) \{ return ""; \}/.test(core));

// Google Places remains — it is better than web search for real venues.
ck('resolvePlace is retained for venues', /export async function resolvePlace/.test(core));
ck('either source counts as grounding', /let resolved = !!evidence;/.test(core));

// PERSISTENCE: the signal used to be computed and thrown away.
ck('grounding is written to canonicals.verified on commit',
   (lib.match(/verified: e\.resolved === true/g) || []).length >= 1);
ck('...and on backfill too, so repairs do not silently unverify',
   (lib.match(/verified: e\.resolved === true/g) || []).length === 2,
   (lib.match(/verified: e\.resolved === true/g) || []).length + ' writes');

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
