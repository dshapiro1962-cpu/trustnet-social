// ============================================================================
// eval-sheet.js — measures THE ANSWER SHEET, which nothing measured before.
//
// WHY THIS EXISTS. eval-retrieval.js posts every question to /search-library
// and nowhere else. So when v0.25.0 replaced vector-only recall with
// search_library_hybrid + rerank on 28 Jul, the eval proved the new engine
// worked — in search-library. build-sheet kept calling match_user_recs and no
// eval, sim or test ever looked at it. Nine weeks later dan opened the sheet
// for a Hebrew question about hotels in Apulia and got a vet, an exterminator
// and a driving instructor.
//
// A fix that is only applied where the eval looks is how that happens twice.
// This runs the sheet for EVERY answered query in the account and reports:
//
//   RECALL   did every answer the circle gave reach the sheet?   (objective)
//   NOISE    what did the "from your library" section add?       (for review)
//   ERRORS   recall_error / judge_error, which must never be     (objective)
//            non-null while the library section is non-empty
//
// The noise column is deliberately not scored. Relevance is a judgement, and a
// number invented here would be a number nobody could argue with. It is printed
// so a human can see it move.
//
// USAGE (from the repo root):
//   node eval/eval-sheet.js --token <access-token>
//   set TN_EVAL_TOKEN=<access-token> && node eval/eval-sheet.js
//
// Get the token from the app: F12 > Console > (the client is a top-level const,
// so it is `sb`, NOT window.sb - const never lands on window):
//   (await sb.auth.getSession()).data.session.access_token
// Or without relying on any global, straight out of storage:
//   JSON.parse(localStorage.getItem('sb-kgsdtfrcyjrxeyqqxoic-auth-token')).access_token
//
// It reads queries and answers through PostgREST as you, so it measures YOUR
// library, and it writes nothing.
// ============================================================================
const SUPABASE_URL = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co';
const ANON = 'sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm';

const ARG_TOKEN = (() => {
  const i = process.argv.indexOf('--token');
  return i > 0 ? process.argv[i + 1] : (process.env.TN_EVAL_TOKEN || '');
})();
// A token may also live in .env.local as TN_EVAL_TOKEN=... — the same
// gitignored file the live sims read TRUSTNET_DB_URL from. That way it is
// pasted once, into a file that never reaches git, instead of onto a command
// line that lands in shell history.
function tokenFromEnvFile() {
  try {
    const p = require('path').join(__dirname, '..', '.env.local');
    // Anchored: an unanchored match also picks up a COMMENTED-OUT line.
    const m = require('fs').readFileSync(p, 'utf8').match(/^TN_EVAL_TOKEN\s*=\s*(.+)$/m);
    if (!m) return '';
    // Chrome's console offers "Copy string as JSON literal" as well as "Copy
    // string contents"; the first wraps the token in double quotes. Strip a
    // matching pair rather than make that a failure.
    const t = m[1].trim().replace(/^(["'])([\s\S]*)$/, '$2').trim();
    // A Supabase access token is a JWT. Anything else - most likely the
    // placeholder from a copied command - is refused here rather than sent as
    // a bearer token, where it comes back as a 401 that reads like an expiry.
    if (!/^eyJ[\w-]+\.[\w-]+\./.test(t)) {
      console.error('  TN_EVAL_TOKEN in .env.local is not a JWT (got "'
        + t.slice(0, 24) + '") - ignoring it.');
      return '';
    }
    return t;
  } catch (_) { return ''; }
}

const ONLY = (() => {
  const i = process.argv.indexOf('--query');
  return i > 0 ? process.argv[i + 1] : '';
})();

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

async function api(token, pathAndQuery) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + pathAndQuery, {
    headers: { Authorization: 'Bearer ' + token, apikey: ANON },
  });
  if (!res.ok) throw new Error('REST ' + res.status + ' on ' + pathAndQuery);
  return res.json();
}

async function sheet(token, queryId) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/build-sheet', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token, apikey: ANON, 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query_id: queryId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: 'http_' + res.status + ': ' + JSON.stringify(body).slice(0, 120) };
  return body;
}

(async () => {
  const token = ARG_TOKEN || tokenFromEnvFile();
  if (!token) {
    console.error('\n  No token. Pass --token <access-token> or set TN_EVAL_TOKEN.');
    console.error('  In the app: F12 > Console > (the client is `sb`, not window.sb)');
    console.error('    (await sb.auth.getSession()).data.session.access_token');
    console.error("  or:  JSON.parse(localStorage.getItem('sb-kgsdtfrcyjrxeyqqxoic-auth-token')).access_token\n");
    process.exit(2);
  }

  const queries = await api(token,
    'queries?select=id,text,sent_at&order=sent_at.desc');
  const rows = [];
  for (const q of queries) {
    if (ONLY && q.id !== ONLY) continue;
    const answers = await api(token,
      'query_responses?select=rec_name,responded_at&query_id=eq.' + q.id
      + '&responded_at=not.is.null&rec_name=not.is.null');
    if (!answers.length) continue;
    rows.push({ q, answers });
  }
  if (!rows.length) { console.error('  No answered queries visible to this token.'); process.exit(2); }

  console.log('\n  ANSWER SHEET EVAL — ' + rows.length + ' answered queries\n');
  console.log('  ' + '-'.repeat(74));

  let totalAnswers = 0, foundAnswers = 0, totalNoise = 0, sheetsWithErrors = 0, engine = '';
  const noisy = [];

  for (const { q, answers } of rows) {
    const d = await sheet(token, q.id);
    if (d.error) {
      console.log('\n  ' + String(q.text).slice(0, 66));
      console.log('      ERROR  ' + d.error);
      sheetsWithErrors++;
      continue;
    }
    engine = d.engine || engine;
    const items = d.items || [];
    const names = items.map((i) => norm(i.name));

    const missing = answers.filter((a) =>
      !names.some((n) => n.includes(norm(a.rec_name)) || norm(a.rec_name).includes(n)));
    totalAnswers += answers.length;
    foundAnswers += answers.length - missing.length;

    // The "from your library" additions: from_you and nobody in the circle
    // named them. This is exactly the population that produced the vet.
    const extras = items.filter((i) => i.from_you && (i.recommenders || []).length === 0);
    totalNoise += extras.length;

    const bad = (d.recall_error || d.judge_error) ? 1 : 0;
    if (bad) sheetsWithErrors++;

    console.log('\n  ' + String(q.text).slice(0, 66));
    console.log('      answers ' + answers.length
      + '   on sheet ' + (answers.length - missing.length)
      + '   library additions ' + extras.length
      + (d.recall_error ? '   recall_error=' + d.recall_error : '')
      + (d.judge_error ? '   judge_error=' + d.judge_error : ''));
    if (missing.length) {
      console.log('      MISSING: ' + missing.map((m) => '"' + m.rec_name + '"').join(', '));
    }
    if (extras.length) {
      console.log('      added:   ' + extras.map((e) => e.name).join(', '));
      noisy.push({ q: String(q.text).slice(0, 44), names: extras.map((e) => e.name) });
    }
    // FAIL-CLOSED CONTRACT: an error means the library section is empty. The
    // old code did the opposite and pasted the whole library in.
    if ((d.recall_error || d.judge_error) && extras.length) {
      console.log('      *** FAIL-OPEN: errored AND still added ' + extras.length
        + ' library items — this is the v0.16.1 behaviour ***');
    }
  }

  console.log('\n  ' + '-'.repeat(74));
  console.log('\n  engine                 ' + (engine || 'unknown'));
  console.log('  answers on their sheet ' + foundAnswers + ' / ' + totalAnswers
    + '  (' + (totalAnswers ? Math.round(100 * foundAnswers / totalAnswers) : 0) + '%)');
  console.log('  library additions      ' + totalNoise + ' across ' + rows.length + ' sheets'
    + '  (' + (rows.length ? (totalNoise / rows.length).toFixed(1) : 0) + ' per sheet)');
  console.log('  sheets reporting error ' + sheetsWithErrors);
  if (noisy.length) {
    console.log('\n  every library addition, for review:');
    noisy.forEach((n) => console.log('    ' + n.q.padEnd(46) + ' + ' + n.names.join(', ')));
  }
  console.log('');
  // The only hard failure: an answer the circle gave that never reached the
  // sheet. Everything else is reported for a person to judge.
  process.exit(foundAnswers < totalAnswers ? 1 : 0);
})().catch((e) => { console.error('\n  THREW: ' + e.message + '\n'); process.exit(1); });
