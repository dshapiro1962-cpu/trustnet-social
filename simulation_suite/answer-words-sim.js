// ═══════════════════════════════════════════════════════════════════════════
// answer-words-sim — two screens that answered a person in the wrong words, or
// in the wrong place.
//
// dan, 27 Sep 2026, from his phone:
//
//   "it says dan is waiting on your answer i think should be for your answer"
//   "the 'nobody of yours matches אור' is bearly noticeable and is located in
//    the wrong place should be under where you type the name"
//
// BOTH ARE THE SAME FAULT in different clothes: the app had something to say
// to a person and said it where they were not looking, or in words that mean
// something else. You wait FOR an answer; you wait ON tables. And the reply to
// what you typed belongs under what you typed, not two blocks below it in the
// grey used for passive hints.
//
// The first one is provable from the file alone: the fallback on the SAME LINE
// already read "A question is waiting for you", so the string disagreed with
// itself a few characters apart.
//
// IT RENDERS WHAT IT ASSERTS. A rule of this repo since 16 Sep, when the Add
// to Library dialog was completely broken in production while a sim asserted
// 24 correct things about its helpers and never called the builder. Section 3
// loads the real page in headless Chrome, opens the real modal, types a real
// name and reads what the screen actually says.
//
// BASELINE: index.pre-v0.99.3.html, copied before a character was changed.
//
//   node answer-words-sim.js         → live code, must PASS
//   node answer-words-sim.js --old   → the baseline, must FAIL
//
// Needs Chrome for section 3 and skips it cleanly without one.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const useOld = process.argv.indexOf('--old') > -1;
const INDEX = useOld
  ? path.join(__dirname, 'index.pre-v0.99.3.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(INDEX)) { console.log('\n  FATAL: missing ' + INDEX + '\n'); process.exit(2); }

// core.autocrlf is true on this machine.
const web = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');

// A STRUCTURAL ASSERTION MUST READ CODE, NOT THE COMMENTS ABOUT IT. The fix
// for the second item keeps the old wording in a comment so the next reader
// knows what was removed and why — and "the dead-end wording is gone" then
// matched that comment and reported FAIL against correct code. This is the
// 25 Aug trap, "anchored on a phrase that first occurs in the comment written
// directly above the fix", and it has now caught three sims in one session.
// Whole comment lines go; a line with an inline // after real code keeps its
// code, and nothing asserted here depends on what follows one.
const webCode = web.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

console.log('\n\u2500\u2500 the words, and where they sit \u2500\u2500 '
  + (useOld ? 'BASELINE v0.99.2' : 'live') + ' \u2500\u2500\n');

// ── 1 · you wait FOR an answer ─────────────────────────────────────────────
console.log('  the waiting card:');

ck('nothing waits ON an answer any more',
   !/waiting on your answer/.test(web));
ck('...it waits FOR one',
   /is waiting for your answer/.test(web));
// The two halves of that ternary must agree, which is the whole reason the
// fault was visible from the file without opening the app.
const line = (web.split('\n').find((l) => l.indexOf('is waiting for your answer') >= 0) || '');
ck('...and the fallback beside it still agrees',
   /A question is waiting for you/.test(line), line.trim().slice(0, 70));

// ── 2 · the reply sits under the question ──────────────────────────────────
console.log('\n  the people search:');

ck('there is a note element of its own',
   /id="nm-search-note"/.test(web));
ck('...directly after the name field, not after Paste a number',
   /id="nm-search"[\s\S]{0,260}?id="nm-search-note"/.test(web)
   && web.indexOf('id="nm-search-note"') < web.indexOf('data-action="paste-number"'));
ck('...in readable text, not the grey used for passive hints',
   /id="nm-search-note"[^>]*font-size:13\.5px;color:#46564E/.test(web));
ck('the dead-end wording is gone',
   !/Nobody of yours matches/.test(webCode));
ck('...replaced by something that points at what to do next',
   /is called \\u201c' \+ esc\(q\) \+ '\\u201d yet\. Add them below\./.test(web)
   || /yet\. Add them below\./.test(web));
ck('the results list is NOT moved above the fallback buttons',
   web.indexOf('data-action="paste-number"') < web.indexOf('id="nm-search-results"'),
   'moving it would push the bottom actions off a phone');
ck('a failed search clears the note rather than leaving it stale',
   /const note = document\.getElementById\('nm-search-note'\);\s*\n\s*if \(note\) note\.style\.display = 'none';[\s\S]{0,200}?Could not search your people/.test(web));
// THE VERSION MOVED, not "the version is v0.99.3". Pinning the literal meant
// the next unrelated bump - the move to trustnetsocial.com - broke this guard
// against perfectly correct code. The invariant is that live differs from the
// baseline this fix was made against, which stays true for ever.
const ver = (src) => (src.match(/APP_VERSION = '([^']*)'/) || [])[1] || '';
const baseVer = ver(fs.readFileSync(path.join(__dirname, 'index.pre-v0.99.3.html'), 'utf8'));
ck('the version moved past the baseline',
   useOld ? ver(web) === baseVer : (!!ver(web) && ver(web) !== baseVer),
   ver(web) + ' vs baseline ' + baseVer);

// ── 3 · AND IT IS RENDERED ─────────────────────────────────────────────────
// A vm over a hand-built DOM cannot catch a render that throws, and neither
// can a regex. This opens the real modal in the real page and reads the screen.
console.log('\n  rendered in Chrome:');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.log('  ..    no Chrome here; section 3 skipped\n');
  console.log('  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-words-'));
// Headless Chrome on Windows will not open a window narrower than ~512px, so
// the page is rendered INSIDE a 390px iframe. And the probe writes its result
// into a known element rather than searching document.body — its own source is
// in there, and a probe that greps the whole body finds itself.
const probe = `<script>
showLoginScreen = function () {};
searchMyPeople = function () { return Promise.resolve([]); };
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    AppState.userProfile = { id:'u0', name:'Dan', avatar:'D', avatarColor:'#1D5A45' };
    AppState._feedFetched = true; AppState._notifFetched = true;
    AppState.userCircles = [{ id:'c1', name:'test', ownerId:'u0', memberIds:['m1'] }];
    AppState.userMembers = [{ id:'m1', circleId:'c1', ownerId:'u0', name:'Rakefet',
      contactMethod:'whatsapp', contactValue:'+972500000000' }];
    AppState.userRecs = []; AppState.userCanonicals = [];
    AppState.userQueries = [{ id:'q1', circleId:'c1', sentBy:'u0', text:'q' }];
    AppState._notifications = [{ id:'n1', type:'query', response_token:'tok',
      handled_at:null, created_at:new Date().toISOString(), actor_name:'Dany',
      body:'is there a good ferry connection between kos and leros' }];
    try { localStorage.setItem('tn_has_recommended','1'); } catch (e) {}
    try { localStorage.setItem('tn_a2hs_skipped','1'); } catch (e) {}
    showView('home');
    var card = document.querySelector('.tn-wcard-t');
    var out = { card: card ? card.textContent : null };
    openModal('add-member', { circleId:'c1', circleName:'test' });
    setTimeout(function () {
      var f = document.getElementById('nm-search');
      if (f) { f.value = 'zzz'; refreshPeopleSearch(); }
      setTimeout(function () {
        var note = document.getElementById('nm-search-note');
        var paste = document.querySelector('[data-action="paste-number"]');
        out.note = note && note.style.display !== 'none' ? note.textContent : null;
        out.noteAbovePaste = (note && paste)
          ? (note.compareDocumentPosition(paste) & Node.DOCUMENT_POSITION_FOLLOWING) > 0
          : null;
        out.results = (document.getElementById('nm-search-results') || {}).innerHTML || '';
        document.title = 'PROBE' + JSON.stringify(out);
      }, 500);
    }, 400);
  }, 250);
});
</` + `script>`;

const inner = path.join(tmp, 'p.html');
fs.writeFileSync(inner, web.replace('</body>', probe + '</body>'), 'utf8');
const outer = path.join(tmp, 'o.html');
fs.writeFileSync(outer, '<!doctype html><html><body style="margin:0">'
  + '<iframe id="f" src="p.html" style="width:390px;height:760px;border:0"></iframe>'
  + '<script>setInterval(function(){try{var t=document.getElementById("f").contentDocument.title;'
  + 'if(t&&t.indexOf("PROBE")===0)document.title=t;}catch(e){}},120);</' + 'script>'
  + '</body></html>', 'utf8');

let dump = '';
try {
  dump = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files', '--virtual-time-budget=9000',
    '--window-size=400,760', '--dump-dom',
    'file:///' + outer.split(path.sep).join('/')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
} catch (e) { dump = ''; }

const m = dump.match(/<title>PROBE(\{[\s\S]*?\})<\/title>/);
let out = null;
try { out = m ? JSON.parse(m[1]) : null; } catch (e) { out = null; }

ck('the page rendered and the probe reported', !!out, m ? 'unparseable' : 'no PROBE title');
if (out) {
  ck('the waiting card says "waiting for your answer"',
     /waiting for your answer/.test(out.card || ''), JSON.stringify(out.card));
  ck('...and never "waiting on"', !/waiting on/.test(out.card || ''));
  ck('the no-match note is VISIBLE on screen', !!out.note, JSON.stringify(out.note));
  ck('...and says what to do next',
     /Add them below/.test(out.note || ''), JSON.stringify(out.note));
  ck('...and sits ABOVE Paste a number in the document',
     out.noteAbovePaste === true, String(out.noteAbovePaste));
  ck('...while the results list is left empty, so nothing is pushed down',
     (out.results || '').trim() === '', (out.results || '').slice(0, 40));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (useOld) {
  console.log(fail > 0
    ? '  CONTROL OK \u2014 the baseline fails, so the checks above measure the fix.\n'
    : '  CONTROL BROKEN \u2014 the baseline PASSES. These checks measure nothing.\n');
  process.exit(fail > 0 ? 0 : 1);
}
process.exit(fail ? 1 : 0);
