// circle-place-sim.js — a circle with a place only takes things from there.
//
// THE FAILURE, dan's inbox 25 Aug:
//
//   Mylos By The Sea      Dining · Leros
//   WHY YOU'RE SEEING THIS
//   dan test2 saved this. You share Italy, which is about restaurants.
//
// A seafood restaurant in GREECE reached him through a circle named after a
// COUNTRY. True on type, absurd on place: nothing in the matching knew where
// anything was. `circles.location` had existed all along, populated on 0 of 30
// rows — the client loaded it into state and never wrote or showed it, the
// sweep never read it. The same dead-flag shape as `verified` and `kind`
// before they were wired up.
//
// dan chose to be asked rather than have it guessed, so the field is optional
// and empty means "anywhere", exactly as before.
//
// This runs the REAL placeFits from suggest-sweep — its body is plain
// JavaScript — plus the real client modal and save handler.
//
//   node circle-place-sim.js         → live code, must PASS
//   node circle-place-sim.js --old   → index.pre-v0.80.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.80.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// ── the real gate, lifted from the sweep ──────────────────────────────────
const sweepSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'suggest-sweep', 'index.ts'), 'utf8');
const coreSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'enrich_core.ts'), 'utf8');

let placeFits = null;
const at = sweepSrc.indexOf('const placeFits = function');
if (at > 0) {
  const open = sweepSrc.indexOf('{', sweepSrc.indexOf('boolean', at));
  let depth = 0, end = -1;
  for (let i = open; i < sweepSrc.length; i++) {
    if (sweepSrc[i] === '{') depth++;
    else if (sweepSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = sweepSrc.slice(open + 1, end).replace(/:\s*string/g, '');
  const normBody = coreSrc.slice(
    coreSrc.indexOf('{', coreSrc.indexOf('export function norm(')) + 1,
    coreSrc.indexOf('}', coreSrc.indexOf('export function norm(')));
  const norm = new Function('s', normBody);
  placeFits = new Function('circleLoc', 'itemLoc', 'norm', body).bind(null);
  const raw = placeFits;
  placeFits = (a, b) => raw(a, b, norm);
}

console.log('\n-- the gate itself --\n');
ck('the sweep has a place gate at all', !!placeFits);

if (placeFits) {
  ck('a Greek restaurant does NOT reach a circle set to Italy',
     placeFits('Italy', 'Leros') === false);
  ck('...and one in Italy does',
     placeFits('Italy', 'Rome, Italy') === true);
  ck('containment works both ways: Leros matches "Leros, Greece"',
     placeFits('Leros', 'Leros, Greece') === true
       && placeFits('Leros, Greece', 'Leros') === true);
  ck('a circle with NO place still accepts from anywhere',
     placeFits('', 'Leros') === true);
  ck('an item with no place — a book, a pair of ski boots — is never excluded',
     placeFits('Italy', '') === true,
     'a thing with no address must not be shut out of a place-bound circle');
  ck('the drop-out is counted, not silent', /wrong_place/.test(sweepSrc));
}

// ── the client asks for it, keeps it, and shows it ────────────────────────
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');

console.log('\n-- the owner is asked, never guessed --\n');
ck('the new-circle form has a place field', /id="nc-location"/.test(src));
ck('the edit form has one too', /id="ec-location"/.test(src));
// A PLACE IS A RESTRICTION MOST CIRCLES NEVER WANT, so it is offered rather
// than asked. dan on the first version: "the change you made make where a
// compulsory field in a way" - sitting between DESCRIPTION and COLOUR as an
// equal field, it read as a decision you had to make.
ck('it is folded away, not asked', /<details class="field">/.test(src));
ck('...and says it is optional where you can see it',
   /Limit to a place \(optional\)/.test(src));
ck('...and says what setting it does',
   /only receive suggestions from there/.test(src));
// A RESTRICTION IN FORCE MUST NOT BE HIDDEN BEHIND A FOLD.
ck('the edit form opens it when a place is already set',
   /c\.location \? ' open' : ''/.test(src));
ck('a new circle carries it', /const newCircle = \{[^}]*location: loc/.test(src));
ck('an edited circle keeps it', /c\.location = \(\(document\.getElementById\('ec-location'\)/.test(src));
ck('saveCircles writes it', /location:c\.location\|\|null/.test(src));
ck('a place that filters is never invisible on the circle',
   /suggestions from elsewhere are not offered/.test(src));

console.log('\n  ' + (useOld ? 'BASELINE v0.79.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
