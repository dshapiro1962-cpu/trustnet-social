// enrich-anchor-sim.js — NO ANCHOR, NO EVIDENCE (v0.73.0).
//
// Reproduces the production failure measured on 24 Aug 2026: three canonicals
// named "Tony Vespa", created with an empty location and no note, enriched into
// an Indianapolis technology consultant with kind, location, tags and category
// all invented and verified:true. "Art Pizza" became a New Haven pizzeria the
// same way.
//
// This is NOT a regex over the source. grounding-sim.js asserts that certain
// strings appear in enrich_core.ts, which cannot fail the way production failed
// — the strings were all present while the bug was live. This runs the REAL
// body of enrichOne, read from the file at run time, against mocked lookups
// that return exactly what the live ones returned that day.
//
// It can do that because enrichOne's body is plain JavaScript: only its
// signature carries type annotations. If someone later puts a type INSIDE the
// body this sim throws a SyntaxError rather than passing quietly.
//
//   node enrich-anchor-sim.js          → the patched enrich_core.ts, must PASS
//   node enrich-anchor-sim.js --old    → enrich_core.pre-v0.73.0.ts, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'enrich_core.pre-v0.73.0.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'enrich_core.ts');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');

// ── extract the real body of enrichOne ────────────────────────────────────
const marker = 'export async function enrichOne(';
const at = src.indexOf(marker);
if (at < 0) { console.error('enrichOne not found in ' + file); process.exit(2); }
const open = src.indexOf('{', src.indexOf('Promise<Enriched>', at));
let depth = 0, end = -1;
for (let i = open; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('could not match enrichOne braces'); process.exit(2); }
const body = src.slice(open + 1, end);

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
let enrichOne;
try {
  enrichOne = new AsyncFunction(
    'key', 'input', 'webGround', 'aiEnrich', 'resolvePlace', 'buildSearchDoc', 'looksLikeSentence',
    body);
} catch (e) {
  console.error('enrichOne body is no longer plain JavaScript: ' + e.message);
  process.exit(2);
}

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// ── the lookups, returning what the live ones returned on 6 Jul ───────────
let groundCalls = [], placeCalls = [];
const mkDeps = () => ({
  webGround: async (k, name, hint) => {
    groundCalls.push({ name, hint });
    // What a live web search returns for the bare string "Tony Vespa".
    return 'Tony Vespa is the founder of Vespa Group LLC, a technology '
         + 'consulting firm based in Indianapolis.';
  },
  aiEnrich: async (k, inp) => {
    // The real prompt says EVIDENCE OUTRANKS recollection, and that with no
    // evidence an empty kind is correct. Both branches modelled.
    if (inp.evidence) {
      return { name: inp.name, kind: 'founder', category: 'professional',
               location: 'Indianapolis', tags: ['technology','consulting','Vespa Group'] };
    }
    return { name: inp.name, kind: '', category: 'other',
             location: inp.location || '', tags: [] };
  },
  resolvePlace: async (name, hint) => {
    placeCalls.push({ name, hint });
    return { name: name, location: 'Indianapolis, United States', category: 'professional' };
  },
  buildSearchDoc: (e) => [e.name, e.kind, e.location, (e.tags||[]).join(' '), e.note, e.query_text]
    .filter(Boolean).join(' · '),
  looksLikeSentence: (s) => (s || '').trim().split(/\s+/).length >= 7,
});
const run = (input) => {
  groundCalls = []; placeCalls = [];
  const d = mkDeps();
  return enrichOne('KEY', input, d.webGround, d.aiEnrich, d.resolvePlace,
                   d.buildSearchDoc, d.looksLikeSentence);
};

(async () => {
  // ── THE PRODUCTION CASE: a name and nothing else ────────────────────────
  let e = await run({ name: 'Tony Vespa', note: '', location: '', query_text: '' });
  ck('a bare name does not reach the web search', groundCalls.length === 0,
     JSON.stringify(groundCalls));
  ck('a bare name does not reach Google Places', placeCalls.length === 0,
     JSON.stringify(placeCalls));
  ck('Tony Vespa does not become an Indianapolis consultant',
     (e.location || '') === '' && (e.kind || '') === '',
     'location=' + JSON.stringify(e.location) + ' kind=' + JSON.stringify(e.kind));
  ck('and it is NOT stamped verified', e.resolved === false, String(e.resolved));
  ck('no invented tags', (e.tags || []).length === 0, JSON.stringify(e.tags));

  // Art Pizza, same shape, same day.
  e = await run({ name: 'Art Pizza', note: '', location: '', query_text: '' });
  ck('Art Pizza does not acquire a New Haven address',
     (e.location || '') === '' && e.resolved === false, JSON.stringify(e.location));

  // ── AN ANCHOR RESTORES THE LOOKUPS ──────────────────────────────────────
  e = await run({ name: 'tony vespa', note: '', location: 'tel aviv', query_text: '' });
  ck('a location IS an anchor: the search runs', groundCalls.length === 1);
  ck('...and the location is passed as the hint',
     groundCalls.length === 1 && /tel aviv/.test(groundCalls[0].hint),
     groundCalls.length ? groundCalls[0].hint : '-');

  e = await run({ name: 'Hakosem', note: 'best falafel in the city', location: '', query_text: '' });
  ck('a note IS an anchor', groundCalls.length === 1);

  e = await run({ name: 'Avoriaz 1800', note: '', location: '',
                  query_text: 'good resort for a family week in France?' });
  ck('a question IS an anchor', groundCalls.length === 1);

  // ── whitespace is not an anchor ─────────────────────────────────────────
  e = await run({ name: 'Tony Vespa', note: '   ', location: '  ', query_text: '' });
  ck('whitespace-only fields are not an anchor', groundCalls.length === 0,
     JSON.stringify(groundCalls));

  // ── the Places half must not fire on a bare name either ─────────────────
  // Even when aiEnrich returns nothing usable, resolvePlace used to run on the
  // name alone and take results[0] anywhere on earth.
  e = await run({ name: 'Brown', note: '', location: '', query_text: '' });
  ck('a one-word name is not resolved to the first business on earth',
     placeCalls.length === 0 && (e.location || '') === '',
     JSON.stringify(e.location));

  console.log('\n  ' + (useOld ? 'ORIGINAL (must FAIL)' : 'PATCHED') + ': '
    + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
