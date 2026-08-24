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

const targets = ['receive-response', 'send-query', 'wa-signin', 'complete-join', 'resend-member'];
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

// A write statement whose result is discarded: `await admin.from(` at the head
// of a statement, with nothing capturing what comes back.
const discarded = (src) => src.split('\n')
  .map((line, i) => ({ line: line.trim(), n: i + 1 }))
  .filter(o => /^await\s+admin\.from\(/.test(o.line));

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
