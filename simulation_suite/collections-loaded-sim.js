// collections-loaded-sim.js — EVERY COLLECTION A CONSUMER READS MUST BE LOADED.
//
// THE BUG (v0.61.1): suggestionCardHtml and handleAcceptSuggestion both did
//     (AppState.people || []).find(p => p.id === sg.from_person_id)
// and NOTHING EVER ASSIGNED AppState.people. Every card therefore fell through
// to "This arrived without a sender" even though the person link was valid —
// dan saw three at once, all with has_person = true in the database, and the
// data repair I proposed matched nothing because there was nothing wrong with
// the data.
//
// THE `|| []` FALLBACK IS WHAT HID IT: an UNLOADED collection and an EMPTY one
// are indistinguishable, so the failure looked like "no people yet". Same shape
// as person_id being written and never read (v0.46.0), and as the phantom
// column that dropped 46 recommendations (v0.57.0). The seam audit checked
// producers and consumers of ROWS; it never asked whether the COLLECTIONS
// consumers read are populated at all.
const fs = require('fs');
const web = fs.readFileSync('/home/claude/app/index.html', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };

const src = web.slice(web.indexOf('<script>', web.indexOf('supabase.min.js')) + 8);
const app = src.slice(0, src.indexOf('</script>'));

// Every AppState collection that is READ must also be ASSIGNED somewhere.
const read = [...new Set((app.match(/AppState\.([a-zA-Z]+) \|\| \[\]/g) || [])
  .map(m => m.replace('AppState.', '').replace(' || []', '')))];
ck('found the collections consumers read', read.length >= 4, read.join(', '));

const unassigned = read.filter(function (name) {
  return !new RegExp('AppState\\.' + name + '\\s*=').test(app);
});
ck('EVERY collection read with `|| []` is also assigned',
   unassigned.length === 0,
   unassigned.length ? 'READ BUT NEVER LOADED: ' + unassigned.join(', ') : '');

// the specific one that broke
ck('AppState.people is loaded', /AppState\.people = pl\.data \|\| \[\]/.test(app));
ck('...from the people table', /from\('people'\)\.select\('id, name/.test(app));
ck('...including linked_user_id, so a sender can be matched by account',
   /select\('id, name, avatar, avatar_color, linked_user_id'\)/.test(app));
ck('...and a load failure is reported, not swallowed', /people load failed:/.test(app));

// the two consumers that depend on it
ck('the suggestion card reads people', /AppState\.people \|\| \[\]\)\.find/.test(app));
ck('accepting a suggestion reads people for provenance',
   /const sgSender = \(AppState\.people \|\| \[\]\)\.find/.test(app));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
