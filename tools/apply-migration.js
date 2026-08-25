// tools/apply-migration.js — run a migration the way the Supabase SQL editor does.
//
// EACH STATEMENT ON ITS OWN CONNECTION. No shared transaction, no rollback of
// earlier statements when a later one fails, and a failure leaves everything
// before it applied. `psql -f` does NOT behave this way, which is why 0036 once
// passed locally and half-applied on production. This is the same discipline
// simulation_suite/sql-editor-runner.sh exists for, against the real database.
//
//   node tools/apply-migration.js migrations/0047_x.sql --dry    show, send nothing
//   node tools/apply-migration.js migrations/0047_x.sql          apply it
//
// THE CREDENTIAL IS NOT IN THIS FILE and must never be. It is read from
// TRUSTNET_DB_URL, or from .env.local in the repo root, which .gitignore
// already excludes (.env.*). Rotate it any time at
// https://supabase.com/dashboard/project/kgsdtfrcyjrxeyqqxoic/settings/database
// — nothing in the app uses the database password, so a reset breaks nothing.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function dbUrl() {
  if (process.env.TRUSTNET_DB_URL) return process.env.TRUSTNET_DB_URL;
  const envFile = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^\s*TRUSTNET_DB_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

// A SEMICOLON IS NOT ALWAYS A STATEMENT BOUNDARY.
// The first version of this split on every `;` and tore a statement in half on
// one inside a comment ("the text exists; nothing can get at it"). A function
// body is full of them too. So: track line comments, single-quoted strings and
// $$ bodies, and only break in plain SQL. Comments are KEPT, because a comment
// inside a function body is part of the source stored in pg_proc.
function split(sql) {
  const out = [];
  let buf = '', i = 0;
  let inDollar = false, inLine = false, inStr = false;
  while (i < sql.length) {
    const two = sql.substr(i, 2);
    if (!inLine && !inStr && two === '$$') { inDollar = !inDollar; buf += two; i += 2; continue; }
    if (!inDollar && !inStr && two === '--') { inLine = true; buf += two; i += 2; continue; }
    const ch = sql[i];
    if (inLine && ch === '\n') { inLine = false; buf += ch; i++; continue; }
    if (!inLine && !inDollar && ch === "'") { inStr = !inStr; buf += ch; i++; continue; }
    if (ch === ';' && !inDollar && !inLine && !inStr) {
      if (buf.trim()) out.push(buf.trim());
      buf = ''; i++; continue;
    }
    buf += ch; i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(s => s.split('\n').some(l => l.trim() && !l.trim().startsWith('--')));
}

const firstReal = (s) =>
  (s.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || '').trim();

(async () => {
  const file = process.argv[2];
  const dry = process.argv.indexOf('--dry') > -1;
  if (!file) { console.error('usage: node tools/apply-migration.js <file.sql> [--dry]'); process.exit(2); }
  if (!fs.existsSync(file)) { console.error('no such file: ' + file); process.exit(2); }

  const url = dbUrl();
  if (!url && !dry) {
    console.error('No database URL. Set TRUSTNET_DB_URL, or put this in .env.local:');
    console.error('  TRUSTNET_DB_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres');
    process.exit(2);
  }

  const stmts = split(fs.readFileSync(file, 'utf8'));
  console.log(path.basename(file) + ': ' + stmts.length + ' statements'
    + (dry ? '   (DRY RUN - nothing sent)' : ''));

  for (let n = 0; n < stmts.length; n++) {
    console.log('\n[' + (n + 1) + '/' + stmts.length + '] ' + firstReal(stmts[n]).slice(0, 95));
    if (dry) continue;
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false },
                           connectionTimeoutMillis: 15000 });
    try {
      await c.connect();
      const r = await c.query(stmts[n]);
      const rows = Array.isArray(r) ? r[r.length - 1].rows : r.rows;
      if (rows && rows.length) console.log('    ' + JSON.stringify(rows));
      else console.log('    ok (' + (r.command || 'done')
        + (r.rowCount != null ? ', ' + r.rowCount + ' rows' : '') + ')');
    } catch (e) {
      console.error('    FAILED: ' + (e.code || '') + ' ' + e.message);
      console.error('    STOPPING. Statements 1..' + n + ' are applied; this one is not.');
      try { await c.end(); } catch (_) {}
      process.exit(1);
    }
    try { await c.end(); } catch (_) {}
  }
  console.log('\nall statements applied');
})();
