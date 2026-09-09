// collection-completeness-sim.js — a shared list is what the owner SELECTED,
// not what happened to be new.
//
// THE FAILURE, dan's screen 9 Sep 2026, 11:21. He deleted a collection,
// re-imported the same WhatsApp chat to rebuild it, and got a page reading
// "RECOMMENDATION 1" — one babysitter, where there should have been 23.
//
// Measured cause:
//
//   things from that chat already in his library ... 22
//   recommendations created by the 11:21 run ....... 1
//   collection_items written ...................... 1
//
// The collection was built from `recIds`, which only collected rows that were
// INSERTED. Anything recognised as "already mine" hit `continue` before the
// push and fell out of the list.
//
// This was invisible for as long as the dedup barely worked: the extractor is
// an LLM, a one-character rewrite made almost every item look new, and almost
// everything therefore got inserted AND collected. Normalising the dedup key
// (v0.83.0) fixed the duplicates and exposed this in full — the list went from
// 24 items to 1.
//
// Whether a row already exists is an implementation detail of the owner's
// library. It must not decide what his neighbours get to see.
//
// The map building and the key are pure once the type annotations come off, so
// THIS RUNS THE REAL CODE. There is no Deno or TypeScript runtime on dan's
// machine, so the two assertions about the skip branch are STRUCTURE CHECKS and
// are labelled as such.
//
//   node collection-completeness-sim.js         → live code, must PASS
//   node collection-completeness-sim.js --old   → extract-chat-recs.pre-v0.84.0.ts, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'extract-chat-recs.pre-v0.84.0.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'extract-chat-recs', 'index.ts');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const src = fs.readFileSync(file, 'utf8');

// ── lift the real key and the real map builder ────────────────────────────
const nnAt = src.indexOf('const normNote =');
const dkAt = src.indexOf('const dedupKey =');
const mapAt = src.indexOf('const haveId = new Map');

let lookup = null;
if (nnAt > -1 && dkAt > -1 && mapAt > -1) {
  // from normNote through the closing brace of the map-building for-loop
  let depth = 0, mapEnd = -1;
  const forAt = src.indexOf('for (const r of', mapAt);
  for (let i = src.indexOf('{', forAt); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { mapEnd = i; break; } }
  }
  const body = src.slice(nnAt, mapEnd + 1)
    .replace(/:\s*string/g, '')
    .replace(/new Map<[^>]*>\(\)/g, 'new Map()')
    .replace(/\(mine \?\? \[\]\) as any\[\]/g, '(mine || [])')
    .replace(/\(r: any\)/g, '(r)');
  // returns the function the loop body uses: key -> existing recommendation id
  lookup = new Function('mine', 'const _m = mine;' + body.replace('mine ?? []', '_m')
    + '\n; return function(canId, src, note) { return haveId.get(dedupKey(canId, src, note)); };')
}

const CAN = '0afac6a0-0000-0000-0000-000000000001';
const SRC = 'קבוצת וואטסאפ · _chat';

console.log('\n-- already mine, and still on the list --\n');

ck('the lookup can answer WHICH recommendation, not just whether', !!lookup,
   'a Set knows it has the key; a collection needs the id');

if (lookup) {
  // dan's library as it stood: one rec, saved with a full stop.
  const find = lookup([
    { id: 'rec-existing-1', canonical_id: CAN, source_label: SRC,
      note: 'נקי סטרילי מקצועית, בטיפול שלה שנים רבות.' }
  ]);

  // The re-import offers the same recommendation without the full stop.
  ck('a re-worded repeat finds the recommendation already held',
     find(CAN, SRC, 'נקי סטרילי מקצועית, בטיפול שלה שנים רבות') === 'rec-existing-1',
     'this id is what puts a skipped item back on the list');

  ck('a genuinely different endorsement is not mistaken for it',
     find(CAN, SRC, 'מחירים טובים, אמין ומצויין') === undefined);

  ck('nor is the same sentence about a different provider',
     find(CAN.replace(/1$/, '2'), SRC, 'נקי סטרילי מקצועית, בטיפול שלה שנים רבות.') === undefined);

  // FIRST WINS. Two identical rows must not make the map point at the later
  // one; the collection should carry the recommendation that has been there.
  const dup = lookup([
    { id: 'rec-first', canonical_id: CAN, source_label: SRC, note: 'אמין' },
    { id: 'rec-second', canonical_id: CAN, source_label: SRC, note: 'אמין' }
  ]);
  ck('when the library already holds two identical rows, the first is used',
     dup(CAN, SRC, 'אמין') === 'rec-first');
}

console.log('\n-- the skip branch (structure check, no Deno here) --\n');

// The whole bug was one `continue` reached before the push. These assert the
// shape of the branch rather than running it, and say so.
const skipBlock = (src.match(/if \(alreadyId\) \{[\s\S]{0,320}?\n      \}/) || [''])[0];
ck('[structure] a skipped item is added to the collection',
   /recIds\.push\(alreadyId\)/.test(skipBlock),
   'without this, "already in your library" means "left out of your list"');
ck('[structure] ...and never added twice',
   /recIds\.indexOf\(alreadyId\)\s*<\s*0/.test(skipBlock));
ck('[structure] ...and it is still counted as skipped, not saved',
   /skipped\+\+/.test(skipBlock));
ck('[structure] the query asks for the row id it now needs',
   /select\("id, canonical_id, source_label, note"\)/.test(src));
ck('[structure] the old Set is gone, not left beside the Map',
   !/const have = new Set/.test(src),
   'two answers to one question is how they drift');

console.log('\n  ' + (useOld ? 'BASELINE v0.83.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
