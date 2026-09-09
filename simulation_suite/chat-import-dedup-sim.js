// chat-import-dedup-sim.js — one person, one row in the chat-import review.
//
// THE FAILURE, dan's own neighbourhood group, 29 Aug 2026:
//
//   10:45  migal8    "מדביר למקקים- המלצה?"
//   11:01  ורד       "אמיר - מדביר / מקצועי, אמין, אחראי / 0526201668"
//   11:03  בנצי      "גל המדביר ... מדביר אצלי פעם בשנה כבר 8 שנים"
//   15:01  Vardit    "יגאל המדביר שלנו, מחירים טובים, אמין ומצויין"
//   20:41  רונית      "מצטרפת להמלצות על גל"
//
// One exterminator, three names, one number. The review list keyed on the
// NAME, so dan saved three rows; the server keyed on the PHONE (0020) and
// folded them onto one canonical. His library ended up with one entity and
// three recommendations, looking like three exterminators until you notice
// the numbers match.
//
// This runs THE REAL DEDUP BLOCK lifted out of handleChatImportRun, and the
// real normalizeIlPhone, against the real messages above.
//
//   node chat-import-dedup-sim.js         → live code, must PASS
//   node chat-import-dedup-sim.js --old   → index.pre-v0.82.0.html, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.82.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');

// ── lift the real code ────────────────────────────────────────────────────
// The dedup region runs from whichever accumulator the version declares first
// down to the line that hands the result to AppState. Anchoring on both names
// keeps ONE extractor working across the change.
// `found.forEach(function(it)` occurs exactly once in both versions. From
// there, walk BACKWARDS over the accumulator declarations the version happens
// to use — one `byName` before, three (`groups`, `byPhone`, `byName`) after —
// so a single extractor spans the change. Anchoring on a declaration NAME
// instead put `start` on an unrelated `const groups = []` 400 lines earlier
// and the control died on a syntax error rather than a failed assertion.
const end = src.indexOf('AppState._chatImportItems = items;');
const anchor = src.indexOf('found.forEach(function(it)');
if (end < 0 || anchor < 0) { console.error('could not locate the dedup block'); process.exit(2); }
const lines = src.slice(0, anchor).split('\n');
let back = lines.length - 1;
while (back > 0 && /^\s*(const|let)\s+\w+\s*=\s*(\{\}|\[\])\s*;\s*$/.test(lines[back - 1])) back--;
const start = lines.slice(0, back).join('\n').length + 1;
const block = src.slice(start, end);

const npStart = src.indexOf('function normalizeIlPhone(');
let d = 0, npEnd = -1;
for (let i = src.indexOf('{', npStart); i < src.length; i++) {
  if (src[i] === '{') d++;
  else if (src[i] === '}') { d--; if (d === 0) { npEnd = i; break; } }
}
const normalizeIlPhone = new Function('return ' + src.slice(npStart, npEnd + 1))();

const dedup = new Function('found', 'normalizeIlPhone', block + '\n; return items;');
const run = (found) => dedup(found, normalizeIlPhone);

const item = (name, phone, note, location) => ({
  name: name, phone: phone || '', note: note || '',
  category: 'professional', location: location || ''
});

console.log('\n-- the real thread: one exterminator, three names, one number --\n');

const gal = run([
  item('אמיר', '0526201668', 'מקצועי, אמין, אחראי'),
  item('גל המדביר', '0526201668', 'מקצועי מאוד, מומלץ על ידי רבים בקבוצה'),
  item('יגאל המדביר', '052-620-1668', 'מחירים טובים, אמין ומצויין')
]);

ck('three names and one number make ONE row', gal.length === 1,
   'got ' + gal.length + ' rows: ' + gal.map(g => g.name).join(', '));

if (gal.length === 1) {
  ck('...counted as three, so the ×N chip tells the truth', gal[0].count === 3,
     'count=' + gal[0].count);
  // A DIFFERENT FORMAT IS THE SAME NUMBER. Keying on the raw string would put
  // "052-620-1668" in its own row.
  ck('...even though one was written 052-620-1668', /1668/.test(gal[0].phone || ''));

  // THE POINT OF JOINING. Keeping the longest sentence kept the vaguest one
  // and threw away the price and the eight years.
  ck('all three endorsements survive', ['מקצועי, אמין, אחראי',
      'מקצועי מאוד, מומלץ על ידי רבים בקבוצה', 'מחירים טובים, אמין ומצויין']
      .every(n => (gal[0].note || '').indexOf(n) > -1),
     JSON.stringify(gal[0].note));
  ck('...joined with the separator this file already uses',
     (gal[0].note || '').indexOf(' · ') > -1, JSON.stringify(gal[0].note));
}

console.log('\n-- what must NOT merge --\n');

// TWO PROVIDERS, TWO NUMBERS. A dedup that over-merges is worse than one that
// under-merges: it silently deletes somebody's recommendation.
const twoVets = run([
  item('אילן הווטרינר', '0501111111', 'מומלץ על ידי מספר חברים'),
  item('שרון רגב', '0502222222', 'וטרינר מצוין')
]);
ck('two different providers stay two rows', twoVets.length === 2,
   'got ' + twoVets.length);

// THE HONEST LIMIT. Different names, only one number: nothing the client can
// see links them. The server still folds them onto one canonical.
const unlinkable = run([
  item('אמיר', '0526201668', 'מקצועי'),
  item('גל', '', 'אחלה מדביר')
]);
ck('[limit] different names with only one number stay separate here',
   unlinkable.length === 2,
   'documented, not desired - match_canonical folds these server-side');

console.log('\n-- the ordinary cases still hold --\n');

// REGRESSION GUARD, passes on --old too: the old key was the name, and that
// case must keep working.
const sameName = run([
  item('גל המדביר', '', 'מקצועי'),
  item('גל המדביר', '0526201668', 'מחירים טובים')
]);
ck('[regression] the same name twice is one row', sameName.length === 1,
   'got ' + sameName.length);
if (sameName.length === 1) {
  ck('...and the number arriving second is kept',
     /1668/.test(sameName[0].phone || ''), JSON.stringify(sameName[0].phone));
  // THE JOINING HALF OF THE CHANGE, TESTED WHERE THE OLD CODE ALSO MERGES.
  // Every assertion on the exterminator sits behind `gal.length === 1`, which
  // the baseline never reaches — skipped is not the same as failed. Here the
  // baseline DOES merge, and keeps only the longer sentence, so this fails on
  // --old for the right reason.
  ck('both notes survive a merge, not just the longer one',
     (sameName[0].note || '').indexOf('מקצועי') > -1
       && (sameName[0].note || '').indexOf('מחירים טובים') > -1,
     JSON.stringify(sameName[0].note));
}

const repeated = run([
  item('נתן אינסטלטור', '0522539277', 'אינסטלטור אמין'),
  item('נתן אינסטלטור', '0522539277', 'אינסטלטור אמין')
]);
ck('the identical note is not repeated back at you',
   repeated.length === 1 && (repeated[0].note.match(/אינסטלטור אמין/g) || []).length === 1,
   JSON.stringify(repeated[0] && repeated[0].note));

const nameless = run([item('', '0500000000', 'no name'), item('  ', '', 'blank')]);
ck('an item with no name is dropped, as before', nameless.length === 0,
   'got ' + nameless.length);

const order = run([
  item('ROK', '', 'בלון גז'),
  item('עליזה', '0542076430', 'בייביסיטר'),
  item('נים בי', '', 'לכנימות')
]);
ck('first-seen order is preserved',
   order.map(g => g.name).join(',') === 'ROK,עליזה,נים בי',
   order.map(g => g.name).join(','));

console.log('\n  ' + (useOld ? 'BASELINE v0.81.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
