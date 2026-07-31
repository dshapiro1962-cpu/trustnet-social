// ============================================================================
// eval-retrieval.js — turns "search feels better" into a NUMBER.
//
// Runs every question in eval-questions.txt against the LIVE search-library
// function using the E2E test account's saved session, and scores whether the
// expected item came back — and how high it ranked.
//
// USAGE (from the repo root, after `npx playwright test` has saved a session):
//   cd e2e
//   node ../eval/eval-retrieval.js
//
// QUESTION FILE FORMAT (eval/eval-questions.txt) — one pair per line:
//   good ski resort for children | Avoriaz 1800
//   רופא עור טוב | ד"ר לירן חורב
//   somewhere for shakshouka in tel aviv | Opa
//   # lines starting with # are ignored
//
// Matching is forgiving: an expected item counts as found if its text appears
// in the returned item's name (case-insensitive, whitespace-normalised), so you
// can write "Opa" for "Opa Restaurant".
// ============================================================================
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://kgsdtfrcyjrxeyqqxoic.supabase.co';
const ANON = 'sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm';
// Which library to measure. By default the E2E TEST account's session — which
// holds test junk, not your real library. Point it at YOUR account with:
//     node eval/eval-retrieval.js --token <access-token>
// or  set TN_EVAL_TOKEN=<access-token>   (get it from the app: F12 > Console)
const AUTH_FILE = path.join(__dirname, '..', 'e2e', '.auth', 'session.json');
const ARG_TOKEN = (() => {
  const i = process.argv.indexOf('--token');
  return i > 0 ? process.argv[i + 1] : (process.env.TN_EVAL_TOKEN || '');
})();
const QUESTIONS = path.join(__dirname, 'eval-questions.txt');
const TOP_N = 5; // "found" means: in the top N results

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function readToken() {
  if (ARG_TOKEN && ARG_TOKEN.length > 100) {
    console.log('(measuring the account for the token you supplied)\n');
    return ARG_TOKEN.trim();
  }
  console.log('(measuring the E2E TEST account — pass --token to measure your own library)\n');
  const st = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  for (const o of st.origins || []) {
    for (const item of o.localStorage || []) {
      if (!/^sb-.*-auth-token$/.test(item.name)) continue;
      try {
        const v = JSON.parse(item.value);
        const tok = v.access_token || (v.currentSession && v.currentSession.access_token);
        if (tok) return tok;
      } catch (e) { /* keep looking */ }
    }
  }
  throw new Error('No access token in ' + AUTH_FILE + ' — run `npx playwright test` in /e2e first.');
}

function readPairs() {
  if (!fs.existsSync(QUESTIONS)) {
    throw new Error('Missing ' + QUESTIONS + ' — write your question | expected-item pairs there.');
  }
  return fs.readFileSync(QUESTIONS, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [q, ...rest] = l.split('|');
      return { question: (q || '').trim(), expected: rest.join('|').trim() };
    })
    .filter((p) => p.question && p.expected);
}

async function search(token, query) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/search-library', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit: 10 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('search failed ' + res.status + ': ' + body.slice(0, 200));
  }
  return res.json();
}

(async () => {
  const token = readToken();
  const pairs = readPairs();
  console.log('Retrieval eval — ' + pairs.length + ' questions, "found" = top ' + TOP_N + '\n');

  let found = 0, top1 = 0, missed = 0, errors = 0;
  const ranks = [];
  const failures = [];

  for (const p of pairs) {
    let r;
    try { r = await search(token, p.question); }
    catch (e) { errors++; console.log('  ERR  ' + p.question + '  (' + e.message + ')'); continue; }

    const names = (r.items || []).map((it) => norm(it.name));
    const want = norm(p.expected);
    const idx = names.findIndex((n) => n.includes(want) || want.includes(n));

    if (idx === 0) { top1++; found++; ranks.push(1); console.log('  ✓#1  ' + p.question + '  →  ' + (r.items[0].name || '')); }
    else if (idx > 0 && idx < TOP_N) { found++; ranks.push(idx + 1); console.log('  ✓#' + (idx + 1) + '  ' + p.question + '  →  ' + (r.items[idx].name || '')); }
    else {
      missed++;
      failures.push({ q: p.question, want: p.expected, got: (r.items || []).slice(0, 3).map((i) => i.name) });
      console.log('  ✗    ' + p.question + '  (wanted "' + p.expected + '", got: ' + ((r.items || []).slice(0, 3).map((i) => i.name).join(', ') || 'nothing') + ')');
    }
  }

  const scored = pairs.length - errors;
  const pct = (n) => scored ? Math.round((n / scored) * 100) : 0;
  const avgRank = ranks.length ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(2) : '-';

  console.log('\n──────── SCORE ────────');
  console.log('  questions scored : ' + scored + (errors ? ('  (' + errors + ' errored)') : ''));
  console.log('  found in top ' + TOP_N + '  : ' + found + '/' + scored + '  (' + pct(found) + '%)');
  console.log('  ranked #1        : ' + top1 + '/' + scored + '  (' + pct(top1) + '%)');
  console.log('  average rank     : ' + avgRank);
  console.log('  missed           : ' + missed);

  if (failures.length) {
    console.log('\n──────── MISSES (the work list) ────────');
    for (const f of failures) console.log('  "' + f.q + '"\n      wanted: ' + f.want + '\n      got   : ' + (f.got.join(', ') || 'nothing'));
  }
  process.exit(missed > 0 ? 1 : 0);
})();
