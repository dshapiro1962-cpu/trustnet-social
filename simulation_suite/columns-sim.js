// columns-sim.js — NEVER ASK FOR A COLUMN THAT DOES NOT EXIST (v0.57.0).
//
// THE BUG: suggest-sweep did
//     .from("recommendations").select("... created_at, person_id")
// but person_id is a column on MEMBERS, not on recommendations — and it was
// never used from that row. PostgREST rejected the whole query, the error was
// discarded, and 46 recommendations silently vanished from every run while the
// answers half sailed through. dan's Jackson Hole was in the missing half.
// FIVE ROUNDS of diagnosis examined the wrong data because of one wrong word.
//
// A mistyped column is invisible until runtime, and if its error is swallowed
// it is invisible even then. This check reads every .from().select() in the
// shipped edge functions and compares it against the migrations.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

// Build the real schema from the migrations — the same source that builds the
// database, so this cannot drift from what actually gets created.
const MIG = '/home/claude/fx-out/supabase/migrations';
const sql = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()
  .map(f => fs.readFileSync(path.join(MIG, f), 'utf8')).join('\n')
  .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

const cols = {};
let m;
const ct = /create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
while ((m = ct.exec(sql)) !== null) {
  cols[m[1]] = cols[m[1]] || new Set();
  m[2].split('\n').forEach(line => {
    const c = line.match(/^\s*(\w+)\s+\w/);
    if (c && !['primary','foreign','unique','constraint','check'].includes(c[1].toLowerCase()))
      cols[m[1]].add(c[1].toLowerCase());
  });
}
const ac = /alter table (?:public\.)?(\w+)\s+add column (?:if not exists )?(\w+)/gi;
while ((m = ac.exec(sql)) !== null) {
  cols[m[1]] = cols[m[1]] || new Set();
  cols[m[1]].add(m[2].toLowerCase());
}
ck('the schema was parsed from the migrations', Object.keys(cols).length >= 12,
   Object.keys(cols).length + ' tables');
ck('...including the table this bug was on',
   cols.recommendations && cols.recommendations.has('canonical_id'));
ck('person_id is on MEMBERS', cols.members && cols.members.has('person_id'));
ck('...and NOT on recommendations',
   cols.recommendations && !cols.recommendations.has('person_id'));

// Every column any shipped function asks for must exist on that table.
const FN = '/home/claude/fx-out/supabase/functions';
const offenders = [];
fs.readdirSync(FN).forEach(d => {
  const f = path.join(FN, d, 'index.ts');
  if (!fs.existsSync(f)) return;
  // STRIP COMMENTS FIRST. The bug this suite exists for had a five-line comment
  // between .from() and .select(), which pushed the pair outside a 120-char
  // window — so the check SILENTLY SKIPPED the very query it was written to
  // catch and passed vacuously. Third time a check has been fooled by prose in
  // this project.
  const src = fs.readFileSync(f, 'utf8')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  // The gap between .from() and .select() may contain whitespace and dots ONLY.
  // A 400-char anything-goes window reached forward into UNRELATED later
  // queries and flagged three false positives (taste_matches, wa_otp) that use
  // delete/insert. Too loose is as useless as too tight: it produces noise
  // people learn to ignore.
  const re = /\.from\("(\w+)"\)[\s\.]*\.?select\("([^"]+)"\)/g;
  let q;
  while ((q = re.exec(src)) !== null) {
    const tbl = q[1];
    if (!cols[tbl]) continue;                       // table not in migrations; other checks cover that
    // PostgREST embeds joins as `canonicals(name, location)`. Splitting the
    // whole string on commas tears those apart and reports the INNER columns as
    // belonging to the OUTER table — 40 false positives on the first attempt.
    // Strip bracketed groups first, and ignore anything with a ! (foreign-key
    // hints like users!queries_sent_by_fkey).
    // Remove `name(...)` embeds ENTIRELY — the join NAME is not a column of the
    // outer table either. Repeat until stable, because they nest:
    // recommendations(note, canonicals(name, location)).
    let flat = q[2], prev;
    do { prev = flat; flat = flat.replace(/[\w!]+\([^()]*\)/g, ''); } while (flat !== prev);
    flat.split(',').forEach(raw => {
      const c = raw.trim();
      if (!c || c === '*' || c.includes('!') || c.includes('(') || c.includes(')')) return;
      if (!cols[tbl].has(c.toLowerCase())) offenders.push(d + ': ' + tbl + '.' + c);
    });
  }
});
ck('no shipped function selects a column that does not exist',
   offenders.length === 0, offenders.join(' | '));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
