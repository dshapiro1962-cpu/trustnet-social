// search-namenet-sim.js — an empty answer beats a wrong one.
//
// THE FAILURE, measured on production 24 Aug 2026: searching "greta", a name
// that is not in the library at all, returned "The Israel Museum" labelled
// "closest match in your library". The reranker had done its job and returned
// {"results":[]}; the fallback below it overrode that verdict.
//
//   fell_back: true | reranked: false | rerank_error: null
//   The Israel Museum | score 0.320 | kw 0.500 | vec 0.139
//
// kw_sim is similarity(search_doc, query) over the WHOLE catalogue document, so
// a note reading "great archeology" scored 0.500 against "greta" and cleared
// the 0.4 threshold. The vector arm was right and scored it 0.139.
//
// This runs the REAL fallback block, extracted from index.ts at run time — the
// block is plain JavaScript, like enrichOne's body. It is not a regex over the
// source and not a copy of the logic.
//
//   node search-namenet-sim.js          → the live function, must PASS
//   node search-namenet-sim.js --old    → baseline-v0.72.2, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'baseline-v0.72.2', 'search-library.index.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'search-library', 'index.ts');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');

// ── the real norm, from the one place it is defined ───────────────────────
const coreSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'enrich_core.ts'), 'utf8');
const normBody = coreSrc.slice(
  coreSrc.indexOf('{', coreSrc.indexOf('export function norm(')) + 1,
  coreSrc.indexOf('}', coreSrc.indexOf('export function norm(')));
const norm = new Function('s', normBody);

// ── the real fallback block ───────────────────────────────────────────────
const start = src.indexOf('let fellBack = false;');
if (start < 0) { console.error('fallback block not found'); process.exit(2); }
const ifAt = src.indexOf('if (!pick.length) {', start);
if (ifAt < 0) { console.error('if (!pick.length) not found'); process.exit(2); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', ifAt); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('could not match braces'); process.exit(2); }
const body = src.slice(start, end + 1);

let runNet;
try {
  runNet = new Function('candidates', 'limit', 'query', 'norm', 'pick',
    body + '\nreturn { pick: pick, fellBack: fellBack };');
} catch (e) {
  console.error('fallback block is no longer plain JavaScript: ' + e.message);
  process.exit(2);
}

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};
const names = (r) => r.pick.map((p) => p.c.name).join(', ') || '(none)';

// The library as it actually stood.
const museum = { rec_id: 'r1', name: 'The Israel Museum',
                 search_doc: 'The Israel Museum · museum · Jerusalem · great archeology',
                 kw_sim: 0.500, vec_sim: 0.139 };
const hakosem = { rec_id: 'r2', name: 'Hakosem',
                  search_doc: 'Hakosem · falafel restaurant · Tel Aviv',
                  kw_sim: 0.900, vec_sim: 0.800 };
const hakosemFull = { rec_id: 'r3', name: 'Hakosem Falafel',
                      search_doc: 'Hakosem Falafel · Tel Aviv', kw_sim: 0.9, vec_sim: 0.8 };
const tinyName = { rec_id: 'r4', name: 'a', search_doc: 'a · something',
                   kw_sim: 0.0, vec_sim: 0.0 };

const go = (query, candidates, pick) =>
  runNet(candidates, 12, query, norm, pick || []);

console.log('\n── the production case ──\n');
let r = go('greta', [museum], []);
ck('"greta" returns NOTHING when nothing is named greta',
   r.pick.length === 0, names(r));
ck('...and does not report a fallback', r.fellBack === false, String(r.fellBack));

console.log('\n── the case the net exists for ──\n');
r = go('hakosem', [hakosem, museum], []);
ck('a name you actually have is still returned',
   r.pick.length === 1 && r.pick[0].c.rec_id === 'r2', names(r));
ck('...labelled as a name match, not a "closest match"',
   r.pick.length === 1 && /name/.test(r.pick[0].why || ''),
   r.pick.length ? JSON.stringify(r.pick[0].why) : '-');
ck('...and the unrelated candidate is NOT dragged along',
   !r.pick.some((p) => p.c.rec_id === 'r1'), names(r));

console.log('\n── whole-word containment, both directions ──\n');
r = go('hakosem', [hakosemFull], []);
ck('a query finds a longer name containing it', r.pick.length === 1, names(r));
r = go('hakosem falafel', [hakosem], []);
ck('a longer query finds the shorter name', r.pick.length === 1, names(r));
r = go('  THE israel   MUSEUM ', [museum], []);
ck('case and spacing are normalised', r.pick.length === 1, names(r));

console.log('\n── what containment must NOT do ──\n');
r = go('pizza', [tinyName], []);
ck('a canonical named "a" does not answer every search', r.pick.length === 0, names(r));
r = go('greta', [hakosem, hakosemFull, tinyName], []);
ck('a name that is simply absent returns nothing', r.pick.length === 0, names(r));

console.log('\n── the net must not touch a real result set ──\n');
const already = [{ c: museum, why: 'answers the question' }];
r = go('museum', [museum, hakosem], already);
ck('when the reranker returned results, the net does not run',
   r.pick.length === 1 && r.fellBack === false && r.pick[0].why === 'answers the question',
   names(r) + ' fellBack=' + r.fellBack);

console.log('\n  ' + (useOld ? 'BASELINE v0.72.2 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
