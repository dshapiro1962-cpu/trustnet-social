// reimport-and-phone-sim.js — re-importing a chat must not double a library,
// and a recommendation must carry the number.
//
// THE FAILURE, measured on dan's own data 9 Sep 2026. He imported his
// neighbourhood chat at 09:54, then again at 10:38 after a fix. Every item
// saved a SECOND time, because the "do I already have this?" key included the
// note verbatim and the extractor is an LLM that rewrites itself:
//
//     09:54   [נקי סטרילי מקצועית, בטיפול שלה שנים רבות.]   41 chars
//     10:38   [נקי סטרילי מקצועית, בטיפול שלה שנים רבות]    40 chars
//
// One character. גל המדביר ended up with four recommendations.
//
// The note STAYS in the key — dan's call on 5 Aug, and the reasoning holds: a
// second person's take on the same plumber is a second recommendation, and
// silently dropping it is a worse failure than a visible duplicate. What
// changed is that punctuation, case and spacing no longer make one opinion
// into two.
//
// And dan, 9 Sep: "what is a recommendation worth without a phone number".
// The number was captured all along and the shared page never asked for it.
//
// normNote and dedupKey are pure and become valid JS once the type
// annotations come off, so THIS RUNS THE REAL FUNCTIONS. There is no Deno or
// TypeScript runtime on dan's machine; the get-collection and collection.html
// halves are source checks and say so.
//
//   node reimport-and-phone-sim.js         → live code, must PASS
//   node reimport-and-phone-sim.js --old   → the *.pre-v0.83.0.* snapshots, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const F = (live, old) => path.join(__dirname, useOld ? old : live);
const extractSrcPath = useOld
  ? path.join(__dirname, 'extract-chat-recs.pre-v0.83.0.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'extract-chat-recs', 'index.ts');
const getCollPath = useOld
  ? path.join(__dirname, 'get-collection.pre-v0.83.0.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'get-collection', 'index.ts');
const pagePath = useOld
  ? path.join(__dirname, 'collection.pre-v0.83.0.html')
  : path.join(__dirname, '..', 'web', 'collection.html');

for (const p of [extractSrcPath, getCollPath, pagePath]) {
  if (!fs.existsSync(p)) { console.error('missing fixture: ' + p); process.exit(2); }
}

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// ── run the real key builder ──────────────────────────────────────────────
const tsrc = fs.readFileSync(extractSrcPath, 'utf8');

// Both versions declare dedupKey; only the new one declares normNote above it.
// Take from whichever comes first through the end of the dedupKey statement.
const dkAt = tsrc.indexOf('const dedupKey =');
const nnAt = tsrc.indexOf('const normNote =');
const from = (nnAt > -1 && nnAt < dkAt) ? nnAt : dkAt;
const to = tsrc.indexOf(';', tsrc.indexOf('normNote(note)', dkAt) > -1
  ? tsrc.indexOf('normNote(note)', dkAt)
  : tsrc.indexOf('.trim()', dkAt));
const keySrc = tsrc.slice(from, to + 1).replace(/:\s*string/g, '');
const dedupKey = new Function(keySrc + '\n; return dedupKey;')();

const CAN = 'c7af8222-0000-0000-0000-000000000001';
const SRC = 'קבוצת וואטסאפ · _chat';

console.log('\n-- the same recommendation, imported twice --\n');

// THE ACTUAL PAIR FROM dan's DATABASE.
const a = 'נקי סטרילי מקצועית, בטיפול שלה שנים רבות.';
const b = 'נקי סטרילי מקצועית, בטיפול שלה שנים רבות';
ck('a trailing full stop is not a different opinion',
   dedupKey(CAN, SRC, a) === dedupKey(CAN, SRC, b),
   'this one character doubled dan\'s whole library');

ck('...nor is the plumber\'s',
   dedupKey(CAN, SRC, 'אינסטלטור אמין ישר ולא יקרן.')
     === dedupKey(CAN, SRC, 'אינסטלטור אמין ישר ולא יקרן'));

ck('nor case, spacing or a stray comma',
   dedupKey(CAN, SRC, 'Reliable,  honest — and cheap')
     === dedupKey(CAN, SRC, 'reliable honest and cheap'));

console.log('\n-- what must still count as two --\n');

// OVER-MERGING IS THE WORSE FAILURE: it silently drops a real endorsement.
ck('two neighbours saying different things stay two recommendations',
   dedupKey(CAN, SRC, 'מחירים טובים, אמין ומצויין')
     !== dedupKey(CAN, SRC, 'מדביר אצלי פעם בשנה כבר 8 שנים'),
   'a second person\'s take is a second recommendation (dan, 5 Aug)');

ck('the same words about a different provider are a different key',
   dedupKey(CAN, SRC, 'אמין') !== dedupKey(CAN.replace(/1$/, '2'), SRC, 'אמין'));

ck('the same words from a different chat are a different key',
   dedupKey(CAN, SRC, 'אמין') !== dedupKey(CAN, 'קבוצת וואטסאפ · אחר', 'אמין'));

ck('an empty note does not collide with a real one',
   dedupKey(CAN, SRC, '') !== dedupKey(CAN, SRC, 'אמין'));

console.log('\n-- the number reaches the shared list (source) --\n');

const gsrc = fs.readFileSync(getCollPath, 'utf8');
ck('get-collection asks the database for the phone',
   /canonicals\([^)]*\bphone\b/.test(gsrc),
   'the column has been populated all along and nothing selected it');
ck('...and puts it in the response',
   /phone:\s*can\.phone/.test(gsrc));

const page = fs.readFileSync(pagePath, 'utf8');
ck('the page renders it as a tap-to-call link',
   /href="tel:'\s*\+\s*esc\(it\.phone\)/.test(page),
   'a number you have to select and copy is not a phone number');
ck('...styled, not bare text', /\.item-tel\s*\{/.test(page));

console.log('\n-- the list is for the people given the link --\n');

// A PAGE CARRYING TRADESPEOPLE'S NUMBERS SHOULD NOT BE IN SEARCH RESULTS.
// This is the only part of the privacy question that was ever real: the group
// already has these numbers, Google does not.
ck('the shared page is noindex',
   /<meta\s+name="robots"\s+content="noindex/.test(page));

console.log('\n  ' + (useOld ? 'BASELINE pre-v0.83.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
