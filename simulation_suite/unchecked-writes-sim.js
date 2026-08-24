// unchecked-writes-sim.js — a refused write must never pass silently.
//
// SCOPE AND HONESTY. This is a SOURCE-STRUCTURE check, not a behavioural one.
// It cannot run these functions: they are Deno HTTP handlers and there is no
// Deno or TypeScript runtime on dan's machine (enrich-anchor-sim.js runs real
// code only because enrichOne's BODY happens to be plain JavaScript). So it
// proves "no write here discards its result", not "the handler behaves well".
// That is a weaker claim than this suite prefers, and it is stated rather than
// dressed up. Its CONTROL is real: it runs against copies of the five files as
// they stood at v0.72.2, and must fail on every one of them.
//
//   node unchecked-writes-sim.js         → the live functions, must PASS
//   node unchecked-writes-sim.js --old   → baseline-v0.72.2/, must FAIL
//
// THE INVARIANT: `await admin.from(...)` as a statement throws its result away.
// Postgres does not raise on a refused write through PostgREST — it comes back
// as { error }. A write whose error is never bound cannot be reported, and
// every fault in this file's history has been that shape.

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const F = path.join(__dirname, '..', 'supabase', 'functions');
const B = path.join(__dirname, 'baseline-v0.72.2');

const targets = ['receive-response', 'send-query', 'wa-signin', 'complete-join',
                 'resend-member', 'whatsapp-webhook', 'update-taste-match',
                 'suggest-sweep', 'extract-chat-recs'];
const read = (name) => {
  const p = useOld ? path.join(B, name + '.index.ts') : path.join(F, name, 'index.ts');
  if (!fs.existsSync(p)) { console.error('missing fixture: ' + p); process.exit(2); }
  return fs.readFileSync(p, 'utf8');
};
const readPage = () => {
  const p = useOld ? path.join(B, 'respond.html')
                   : path.join(__dirname, '..', 'web', 'respond.html');
  if (!fs.existsSync(p)) { console.error('missing fixture: ' + p); process.exit(2); }
  return fs.readFileSync(p, 'utf8');
};

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// A write whose result is discarded: `await admin.from(` with nothing capturing
// what comes back.
//
// THE FIRST VERSION ANCHORED ON THE START OF THE LINE and therefore missed
// `if (toInsert.length) await admin.from("taste_matches").insert(toInsert);` —
// the refill after a delete that empties the whole table. A detector that only
// finds the tidy cases is worth very little, so this looks at what precedes the
// call anywhere on the line: an assignment or destructure ends with `=`, and a
// ternary arm ends with `?` or `:`. Anything else throws the result away.
const discarded = (src) => {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const at = line.indexOf('await admin.from(');
    if (at < 0) return;
    const before = line.slice(0, at).trim();
    if (/[=?:]$/.test(before)) return;      // result is captured
    out.push({ line: line.trim(), n: i + 1 });
  });
  return out;
};

console.log('\n── every write reports its own refusal ──\n');
for (const name of targets) {
  const src = read(name);
  const bad = discarded(src);
  ck(name + ': no write discards its result', bad.length === 0,
     bad.length ? bad.map(b => 'line ' + b.n).join(', ') : '');
}

console.log('\n── the answer path specifically ──\n');
const rr = read('receive-response');

// The answer write must bind an error.
ck('receive-response binds the error of the answer write',
   /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("query_responses"\)\.update\(/.test(rr));

// And it must REFUSE, not carry on. A 5xx return has to exist between the
// answer write and the notification, or a lost answer is still announced.
const iWrite  = rr.indexOf('.from("query_responses").update(');
const iNotify = rr.indexOf('.from("notifications").insert(');
const iReturn = rr.indexOf('return err("response_not_saved');
ck('...and returns an error BEFORE notifying the asker',
   iWrite > 0 && iReturn > iWrite && iNotify > iReturn,
   'write@' + iWrite + ' return@' + iReturn + ' notify@' + iNotify);

// success:true must no longer be reachable with a failed answer write: the only
// success return must sit after the guard.
const iSuccess = rr.indexOf('success: true');
ck('...so success:true is unreachable when the answer did not save',
   iReturn > 0 && iSuccess > iReturn, 'return@' + iReturn + ' success@' + iSuccess);

console.log('\n── the two that lose data outright ──\n');

// whatsapp-webhook: the canonical insert was checked and the recommendation
// insert was not, so a failure left a canonical with no library row behind it
// and still replied "Saved to your library".
const ww = read('whatsapp-webhook');
ck('whatsapp-webhook binds the error of the recommendation insert',
   /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("recommendations"\)\.insert\(/.test(ww));
// STRUCTURAL, not a string search. The first version looked for the identifier
// `recErr` anywhere in the file - and the BASELINE passes that, because it
// already has an unrelated `recErr` at line 101 for the invite-claim write. A
// guard that passes for the wrong reason is the exact failure this suite exists
// to prevent. What matters is that a failure RETURNS before the reply.
const iRecIns = ww.indexOf('.from("recommendations").insert(');
// Searched FROM the insert: the phrase also appears in the comment above it,
// which this sim matched first and failed on. Anchoring on prose you wrote
// yourself is not anchoring.
const iSaved  = iRecIns > 0 ? ww.indexOf('Saved to your library', iRecIns) : -1;
const between = (iRecIns > 0 && iSaved > iRecIns) ? ww.slice(iRecIns, iSaved) : '';
ck('...and returns before replying "Saved to your library"',
   /if\s*\(\s*\w*[Ee]rr\w*\s*\)[\s\S]{0,400}?return\s+json\(/.test(between),
   'insert@' + iRecIns + ' saved@' + iSaved);

// update-taste-match: delete-everything then refill. Unchecked on both sides,
// a successful delete plus a failed insert wiped every match in the system and
// returned success.
const tm = read('update-taste-match');
ck('update-taste-match binds the error of the full-table delete',
   /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("taste_matches"\)\s*\n?\s*\.delete\(/.test(tm)
   || /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("taste_matches"\)[\s\S]{0,40}?\.delete\(/.test(tm));
ck('...and aborts before clearing when the delete fails',
   /taste_matches_clear_failed/.test(tm));
ck('...binds the error of the refill insert too',
   /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("taste_matches"\)\.insert\(/.test(tm));
ck('...and says the table was cleared and NOT replaced',
   /cleared and NOT/.test(tm));

console.log('\n── the sweep must not claim progress it did not make ──\n');
const sw = read('suggest-sweep');
const iWm = sw.indexOf('watermarkMoved = true');
const iWmErr = sw.indexOf('sweep_watermark_write_failed');
ck('suggest-sweep sets watermark_moved only after a successful write',
   iWmErr > 0 && iWm > iWmErr, 'err@' + iWmErr + ' moved@' + iWm);

console.log('\n── the send path ──\n');
const sq = read('send-query');
ck('send-query binds the error of the response-row insert',
   /const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await admin\.from\("query_responses"\)\.insert\(/.test(sq));
ck('...and skips the send rather than mailing an unanswerable link',
   /response_row_failed[\s\S]{0,400}?continue;/.test(sq));

console.log('\n── what the answerer is told ──\n');
const page = readPage();
ck('respond.html has a branch for an answer that did not save',
   /response_not_saved/.test(page));
ck('...and puts the form back so she can send again',
   /response_not_saved[\s\S]{0,500}?submit-btn"\)\.disabled = false/.test(page));

console.log('\n  ' + (useOld ? 'BASELINE v0.72.2 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
