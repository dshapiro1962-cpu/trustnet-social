// typecheck-functions.js — no edge function may reference a name that does not
// exist.
//
// THE FAILURE, 9 Sep 2026. The chat-import save was changed to key its "do I
// already have this?" lookup on a Map instead of a Set. The READ site was
// updated; one WRITE site 120 lines further down was not, and still said
// `have.add(...)` against a Set that no longer existed.
//
// It threw ReferenceError on the first item that was NOT skipped. Uncaught, so
// the platform answered 500 with none of the function's CORS headers, and the
// browser reported the whole thing as "Failed to fetch" — no status, no
// message, nothing in the response to read. dan lost an afternoon to it and I
// guessed at the cause twice before reading the code.
//
// `node --check` cannot see this: the syntax is perfect. A sim asserting the
// old Set was GONE passed too — it checked the declaration was removed and
// never asked whether anything still referenced it. Only a type checker can
// answer that, and until now nothing in the repo ran one.
//
// tsc with a Deno shim reduces to exactly the right question. TS2304/TS2552
// mean "you used a name nothing declares". Module resolution is deliberately
// NOT required — the remote https: imports cannot resolve here and do not need
// to; their symbols become `any`, which is fine. We are hunting one bug class.
//
//   node typecheck-functions.js          → all functions, must PASS
//   node typecheck-functions.js --old    → adds a fixture carrying the real
//                                          bug; must FAIL

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const TSC = path.join(REPO, 'tools', 'node_modules', 'typescript', 'bin', 'tsc');
const SHIM = path.join(__dirname, 'deno-shim.d.ts');

if (!fs.existsSync(TSC)) {
  console.error('typescript is not installed. Run:  cd ' + path.join(REPO, 'tools') + ' && npm install');
  process.exit(2);
}

const useOld = process.argv.indexOf('--old') > -1;

const fnDir = path.join(REPO, 'supabase', 'functions');
const targets = fs.readdirSync(fnDir)
  .filter((d) => fs.existsSync(path.join(fnDir, d, 'index.ts')))
  .map((d) => path.join(fnDir, d, 'index.ts'));

// THE CONTROL. Reconstructs the exact bug in a scratch copy — the write site
// left pointing at the deleted Set — so the check is proved to catch it rather
// than assumed to.
let fixture = null;
if (useOld) {
  const live = fs.readFileSync(path.join(fnDir, 'extract-chat-recs', 'index.ts'), 'utf8');
  const broken = live.replace(
    /haveId\.set\(dedupKey\(canonicalId, sourceLabel, note\), recRow\.id as string\);/,
    'have.add(dedupKey(canonicalId, sourceLabel, note));');
  if (broken === live) {
    console.error('control could not reconstruct the bug — the write site has moved');
    process.exit(2);
  }
  fixture = path.join(__dirname, '.control-extract-chat-recs.ts');
  fs.writeFileSync(fixture, broken);
  targets.push(fixture);
}

let out = '';
try {
  execFileSync(process.execPath, [TSC,
    '--noEmit', '--target', 'es2022', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--skipLibCheck',
    '--allowImportingTsExtensions', '--lib', 'es2022,dom',
    SHIM, ...targets], { encoding: 'utf8', cwd: REPO });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}
if (fixture) { try { fs.unlinkSync(fixture); } catch (_) {} }

// TS2307 (cannot resolve a remote module) is expected and ignored: the https:
// imports are not fetched here. TS2304/TS2552 are the whole point.
const bad = out.split('\n')
  .filter((l) => /error TS2304|error TS2552/.test(l))
  .map((l) => l.trim());

console.log('\n-- every name an edge function uses must exist --\n');
console.log('  checked ' + targets.length + ' functions'
  + (useOld ? ' (including the reconstructed bug)' : ''));

if (!bad.length) {
  console.log('\n  ok    no undeclared identifiers\n');
  console.log('  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': 1 passed, 0 failed');
  process.exit(useOld ? 1 : 0);
}

bad.forEach((l) => console.log('  FAIL  ' + l));
console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED')
  + ': 0 passed, ' + bad.length + ' failed');
process.exit(1);
