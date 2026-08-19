// importdedup-sim.js — chat-import must REUSE places and SKIP repeated notes.
//
// THE FAILURE: on 2 Aug 2026 a re-import of "המומלצים של השכונה" produced a
// duplicate pair for all 8 items. Two causes, both fixed here:
//   1. dedup was an EXACT name match — one hyphen defeated it
//      ("שושן שמוליק" vs "שושן-שמוליק")
//   2. chat-import NEVER called match_canonical, so every import minted a
//      fresh canonical. Since v0.38.0 groups cards BY CANONICAL, that means
//      two cards for one place that no grouping can merge.
// Dedup key (dan's call, 5 Aug): canonical + source_label + note. Re-importing
// the same chat skips verbatim repeats; a NEW message about the same place in
// the same group still gets through. Silent loss is worse than a visible dupe.
const fs = require('fs');
const src = fs.readFileSync('/home/claude/functions/extract-chat-recs/index.ts', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// ── the naive dedup is gone ─────────────────────────────────────────────────
ck('no exact-name Set survives (a hyphen defeated it)',
   !/canonicals\(name\)/.test(src) && !/\.map\(\(r: any\) => \(r\.canonicals\?\.name/.test(src));
ck('dedup loads canonical_id + source_label + note',
   /select\("canonical_id, source_label, note"\)/.test(src));
ck('the key is the TRIPLE, not the name',
   /dedupKey = \(canId: string, src: string, note: string\)/.test(src));
ck('key parts are separated by a character that cannot occur in text',
   /\\u0000/.test(src));
ck('key is case- and whitespace-insensitive',
   /\.toLowerCase\(\)\.trim\(\)/.test(src));

// ── canonical REUSE, the deeper fix ─────────────────────────────────────────
ck('chat-import now calls match_canonical (it never did before)',
   /admin\.rpc\("match_canonical"/.test(src));
ck('...with BOTH name and location, as receive-response does',
   /p_name: it\.name\.trim\(\)/.test(src) && /p_location:/.test(src));
// Formatting-insensitive. The old regex demanded the whole branch on ONE line
// and failed the moment it was wrapped — a check that fails on whitespace tells
// you nothing about behaviour and trains people to ignore it.
ck('a matched canonical is REUSED, not duplicated',
   /if \(matchId\)\s*\{[\s\S]{0,120}?canonicalId = matchId as string;[\s\S]{0,40}?reused\+\+;/.test(src));
ck('a new canonical is minted ONLY when nothing matched',
   /if \(!canonicalId\) \{/.test(src));
ck('reuse count is reported back (a re-import should show high reuse)',
   /saved, skipped, reused/.test(src));

// ── ordering: the skip must happen AFTER we know the canonical ──────────────
const iMatch = src.indexOf('admin.rpc("match_canonical"');
const iSkip  = src.indexOf('have.has(dedupKey(canonicalId, sourceLabel, note))');
const iInsert = src.indexOf('from("recommendations").insert');
ck('match runs BEFORE the skip check (the key needs a canonical id)',
   iMatch > 0 && iSkip > iMatch, 'match@' + iMatch + ' skip@' + iSkip);
ck('skip check runs BEFORE any insert', iSkip > 0 && iInsert > iSkip);
ck('the key is recorded after a successful insert (within-batch repeats)',
   /have\.add\(dedupKey\(canonicalId, sourceLabel, note\)\)/.test(src));

// ── the search document must still be written at birth (v0.36.0) ────────────
ck('new canonicals still get a search_doc at birth', /search_doc: searchDoc/.test(src));
ck('...and still embed THE DOCUMENT', /await embed\(key, searchDoc\)/.test(src));
ck('...and are still circle-blind (v0.37.0 product law)', !/circle_name/.test(src));

// ── the trigram threshold, modelled against dan's REAL pairs ────────────────
// pg_trgm: pad each word, take 3-char windows, similarity = |A∩B| / |A∪B|.
// NOTE: this is a MODEL of Postgres's algorithm, not Postgres itself (no DB in
// this container). The pairs sit far from the 0.45 boundary, so the verdicts
// are robust — but treat the exact decimals as indicative.
function trigrams(s) {
  s = s.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const out = new Set();
  s.split(' ').forEach(w => {
    const p = '  ' + w + ' ';
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  });
  return out;
}
function sim(a, b) {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
}
const MUST_MATCH = [
  ['שושן שמוליק', 'שושן-שמוליק'],
  ['Eli מיזוג אוויר', 'Eli מזוג אויר'],
  ['ד"ר רומן טמיר', 'דר רומן טמיר'],
  ['ד"ר לירן חורב', 'דר לירן חורב'],
  ['Tony Vespa', 'tony vespa'],
];
const MUST_NOT = [
  ['Basta', 'Habasta'],           // plausibly different places
  ['K2', 'K2 Sender'],            // brand vs model — search links them instead
  ['אומצה', 'קצביה בשנקין'],       // unrelated butchers
];
MUST_MATCH.forEach(([a, b]) => {
  const v = sim(a, b);
  ck('dedupes ' + a + ' / ' + b + ' (' + v.toFixed(2) + ' > 0.45)', v > 0.45, v.toFixed(3));
});
MUST_NOT.forEach(([a, b]) => {
  const v = sim(a, b);
  ck('keeps ' + a + ' / ' + b + ' SEPARATE (' + v.toFixed(2) + ' < 0.45)', v <= 0.45, v.toFixed(3));
});

// ── scenario table: the three cases dan asked about ─────────────────────────
// Simulated against the real key logic, not the real DB.
const KEY = (c, s, n) => c + '\u0000' + (s || '').toLowerCase().trim() + '\u0000' + (n || '').toLowerCase().trim();
const existing = new Set([KEY('canROK', 'dan · המומלצים של השכונה', 'בלון גז 5 קג')]);
ck('A: re-import of the SAME chat, same note -> SKIPPED',
   existing.has(KEY('canROK', 'dan · המומלצים של השכונה', 'בלון גז 5 קג')));
ck('B: a DIFFERENT group about the same place -> second take KEPT',
   !existing.has(KEY('canROK', 'dan · קבוצת הסקי', 'בלון גז 5 קג')));
ck('C: same group, a NEW note -> KEPT (this is why the note is in the key)',
   !existing.has(KEY('canROK', 'dan · המומלצים של השכונה', 'גם ממלאים בלוני קמפינג')));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
