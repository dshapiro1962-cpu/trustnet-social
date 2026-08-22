// ═══════════════════════════════════════════════════════════════════════════
// blinddelete-sim — a whole-array save may never delete, and a load that fails
// may never look like an empty account.
//
// WHY THIS EXISTS (21 Aug 2026)
// saveMembers, saveCircles and saveRecs each upserted their array and then
// deleted every row not in it — reconstructing "what the user removed" by
// diffing against the database. Two consequences:
//
//   1. An UNLOADED collection and an EMPTY one are indistinguishable. The
//      loads at index.html:1311, 1312 and 1377 never checked their errors, and
//      `(data || [])` turned one dropped request into "this account has
//      nothing". The next save then ran
//          delete ... where owner_id = CURRENT_UID
//      with NO further filter. Every member, every circle, the whole library.
//      The toast said nothing: the delete succeeded.
//
//   2. Rows the client never loaded were reaped. Nine contactless members
//      exist in production whose producer is still unidentified; silently
//      deleting rows nobody understands is how data disappears without a
//      trace. 0036 nulled those rows rather than deleting them, for the same
//      reason.
//
// The fix is structural rather than a guard on the old shape: saves upsert
// only, and removal is explicit — deleteMembersById, deleteCircleById,
// deleteRecsById — taking the ids the user actually removed. An empty list
// deletes nothing, which is the point.
//
// Usage: node blinddelete-sim.js [indexPath]
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

function resolve(arg, candidates) {
  if (arg) return arg;
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}
const INDEX = resolve(process.argv[2], [
  path.join(__dirname, '..', 'web', 'index.html'),
  '/home/claude/app/index.html']);

if (!fs.existsSync(INDEX)) {
  console.log('\n  FATAL: cannot read ' + INDEX);
  console.log('  This check cannot pass on a file it did not read.\n');
  process.exit(2);
}
const web = fs.readFileSync(INDEX, 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  \u2713', n); }
                          else { fail++; console.log('  \u2717', n, x || ''); } };

console.log('\n\u2500\u2500 blind delete \u2500\u2500 no save may delete what it did not name \u2500\u2500\n');

// ── 1 · no unscoped delete anywhere ────────────────────────────────────────
// Every delete must narrow to specific rows: .eq('id', ...) or .in('id', ...).
// A delete filtered ONLY by owner_id removes everything that user has.
const deletes = [...web.matchAll(/\.from\('(\w+)'\)\s*\.delete\(\)([^;]*)/g)];
const unscoped = deletes.filter(m => {
  const tail = m[2];
  return /\.eq\('owner_id'/.test(tail) && !/\.eq\('id'|\.in\('id'/.test(tail);
}).map(m => m[1] + ':' + m[2].replace(/\s+/g, ' ').slice(0, 60));

ck('no delete is scoped by owner alone', unscoped.length === 0, unscoped.join(' | '));

// ── 2 · the three whole-array saves contain no delete at all ───────────────
function body(name) {
  const i = web.indexOf('async function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, j = web.indexOf('{', i);
  const start = j;
  for (; j < web.length; j++) {
    if (web[j] === '{') depth++;
    else if (web[j] === '}') { depth--; if (depth === 0) break; }
  }
  return web.slice(start, j + 1);
}
for (const fn of ['saveMembers', 'saveCircles', 'saveRecs']) {
  const b = body(fn);
  ck(fn + ' contains no delete', b !== null && !/\.delete\(\)/.test(b),
     b === null ? 'function not found' : 'still deletes');
}

// ── 3 · and refuses to run at all after a failed load ──────────────────────
for (const fn of ['saveMembers', 'saveCircles', 'saveRecs']) {
  const b = body(fn);
  ck(fn + ' refuses to save when the load failed',
     b !== null && /dataLoadFailed/.test(b));
}

// ── 4 · the loads that feed those saves check their errors ─────────────────
// The guard must test the PROPERTY, not the spelling. An earlier version looked
// for the text `dataLoadFailed = true` near the load — which survives when the
// condition is neutered to `if (false)`, and a sabotage test proved it did.
// The condition itself must reference the error object.
for (const t of ['circles', 'members', 'recommendations']) {
  const re = new RegExp("from\\('" + t + "'\\)\\.select\\([^;]*;[\\s\\S]{0,400}");
  const seg = (web.match(re) || [''])[0];
  const guarded = /if\s*\([^)]*\.error[^)]*\)\s*\{[\s\S]{0,300}?dataLoadFailed\s*=\s*true/.test(seg);
  ck(t + ' load checks its error before trusting the array', guarded);
}

// ── 5 · explicit removal exists and is actually used ──────────────────────
for (const fn of ['deleteMembersById', 'deleteCircleById', 'deleteRecsById']) {
  const defined = new RegExp('async function ' + fn + '\\(').test(web);
  const calls = (web.match(new RegExp(fn + '\\(', 'g')) || []).length;
  ck(fn + ' is defined and called', defined && calls >= 2,
     defined ? 'defined but never called' : 'not defined');
}

// ── 6 · an empty id list must delete nothing ───────────────────────────────
for (const fn of ['deleteMembersById', 'deleteRecsById']) {
  const b = body(fn);
  ck(fn + ' returns early on an empty list',
     b !== null && /!ids\.length/.test(b));
}

// ── 7 · removal is awaited, so success is never announced before it lands ──
ck('remove-member awaits the delete before saying "removed"',
   /await deleteMembersById\(\[rid\]\)/.test(web));
ck('handleDeleteCircle awaits both deletes',
   /await deleteMembersById\(goneMemberIds\)/.test(web)
   && /await deleteCircleById\(c\.id\)/.test(web));
ck('handleDeleteRec awaits the delete',
   /await deleteRecsById\(\[goneRecId\]\)/.test(web));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
