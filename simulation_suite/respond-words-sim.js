// ═══════════════════════════════════════════════════════════════════════════
// respond-words-sim — the thank-you screen is the one page a stranger meets.
//
// Everyone who answers a question lands on respond.html, and most of them have
// no account. That screen is Trustnet's whole pitch to a cold reader, and on
// 6 Oct it was making it in words nobody had chosen:
//
//   "{name} has you in their {circle} circle."   while privacy.html promised
//                                                a circle "is not shown to
//                                                the people in it"
//   "Trustnet keeps them all in one place"       leading on where things are
//                                                KEPT - rejected in the brief
//   "No ads, no strangers, no algorithm."        a third pitch, not the one
//                                                dan chose on 5 Oct
//   "Sign up with the email this request         wrong for anyone reached by
//    reached you on"                             WhatsApp, the main route
//
// dan, 7 Oct, chose B: KEEP showing the circle's name to the people in it, and
// make the privacy page say so. So this sim asserts both halves - the name is
// still on the question line, AND the written promise now matches it. Then:
// keep "Sent to Tal!", delete "You just gave Tal..." and the TRUSTED VOICE
// badge. The script wrote that line too, so deleting only the markup would
// have thrown after a SUCCESSFUL save and shown "Network error" - scenario A
// requires the thank-you screen to actually appear.
//
// IT RENDERS WHAT IT ASSERTS. Section 2 loads the real page in headless Chrome
// inside a 390px iframe, with fetch stubbed to answer response-meta and
// receive-response, types an answer, presses Send and reads the screen. EACH
// SCENARIO IS ITS OWN CHROME: a shared context between scenarios is a trap.
//
// BASELINES, copied before a character was changed:
//   respond.pre-r2.6.html  privacy.pre-2026-10-07.html  support.pre-2026-10-07.html
//
//   node respond-words-sim.js         → live code, must PASS
//   node respond-words-sim.js --old   → the baselines, must FAIL (exit 1)
//
// WHAT THIS DOES NOT PROVE. "Never who else is in it" rests on RLS: the only
// policy on members, live on 7 Oct, is members_owner (owner_id = auth.uid()),
// and section 3 holds the migrations to that. Whether a SECURITY DEFINER
// function hands member names to someone else was NOT audited.
//
// Needs Chrome for section 2 and skips it cleanly without one.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const useOld = process.argv.indexOf('--old') > -1;
const REPO = path.join(__dirname, '..');
const pick = (live, base) => useOld ? path.join(__dirname, base) : path.join(REPO, 'web', live);
const RESPOND = pick('respond.html', 'respond.pre-r2.6.html');
const PRIVACY = pick('privacy.html', 'privacy.pre-2026-10-07.html');
const SUPPORT = pick('support.html', 'support.pre-2026-10-07.html');
for (const f of [RESPOND, PRIVACY, SUPPORT]) {
  if (!fs.existsSync(f)) { console.log('\n  FATAL: missing ' + f + '\n'); process.exit(2); }
}

// core.autocrlf is true on this machine.
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const respond = read(RESPOND);

// A STRUCTURAL ASSERTION MUST READ CODE, NOT THE COMMENTS ABOUT IT. The fix's
// own comments quote the small print they removed. Whole // lines and HTML
// comment blocks go.
const respondCode = respond.replace(/<!--[\s\S]*?-->/g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// What a reader sees on a static page: no comments, no style, no script, no tags.
const pageText = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&mdash;/g, '\u2014').replace(/&middot;/g, '\u00b7')
  .replace(/&amp;/g, '&').replace(/&rsquo;/g, '\u2019').replace(/\s+/g, ' ');

// The approved sentence, taken from where it lives rather than retyped here.
const index = read(path.join(REPO, 'web', 'index.html'));
const tnExpr = (index.match(/const TN_WHAT_IT_IS = ([\s\S]*?);\n/) || [])[1];
const TN_WHAT_IT_IS = tnExpr ? new Function('return ' + tnExpr)() : '';

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

console.log('\n\u2500\u2500 the answer page, and what it promises \u2500\u2500 '
  + (useOld ? 'BASELINES (must FAIL)' : 'live') + ' \u2500\u2500\n');

// ── 1 · ONE PITCH, IN THE HTML ─────────────────────────────────────────────
console.log('  the source:');

ck('the approved sentence was found in index.html', TN_WHAT_IT_IS.length > 40,
   'without it the rendered check below compares against nothing');
ck('the script no longer overwrites the pitch',
   !/\$\("convert-headline"\)\.textContent/.test(respondCode)
   && !/\$\("convert-body"\)\.textContent/.test(respondCode),
   'two versions of the pitch, one in the HTML and one in the script');
ck('nothing tells the answerer they are in a circle',
   !/has you in their/.test(respondCode));
ck('the email-only small print is gone',
   !/Sign up with the email/.test(respondCode));
ck('the used-link error names no channel',
   !/Gmail|request email/.test(respondCode),
   'questions arrive by WhatsApp or by email');
const ver = (src) => (src.match(/const RESPOND_VERSION = "([^"]*)"/) || [])[1] || '';
const baseVer = ver(read(path.join(__dirname, 'respond.pre-r2.6.html')));
ck('the version moved past the baseline',
   useOld ? ver(respond) !== baseVer : (!!ver(respond) && ver(respond) !== baseVer),
   ver(respond) + ' vs baseline ' + baseVer);
ck('...and the stamp on screen says the same as the constant',
   respond.indexOf('>' + ver(respond) + '</div>') >= 0,
   'dan reads the stamp to confirm a deploy landed');

// ── 2 · RENDERED ───────────────────────────────────────────────────────────
console.log('\n  rendered in Chrome at 390px:');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));

// The stub goes first in <head>, before the page's own script runs. The probe
// writes its result into the title rather than searching document.body - its
// own source is in there.
const stub = (meta, recv) => '<script>(function(){'
  + 'var META=' + JSON.stringify(meta) + ',RECV=' + JSON.stringify(recv) + ';'
  + 'window.fetch=function(u){u=String(u);var b={};'
  + 'if(u.indexOf("/response-meta")>=0)b=META;else if(u.indexOf("/receive-response")>=0)b=RECV;'
  + 'return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(b);}});};'
  + 'window.alert=function(){};'
  + 'function vis(id){var e=document.getElementById(id);return !!e&&!e.classList.contains("hidden");}'
  + 'function txt(id){var e=document.getElementById(id);return e?e.innerText.replace(/\\s+/g," ").trim():null;}'
  + 'window.addEventListener("load",function(){setTimeout(function(){'
  + 'var out={form:vis("form-view"),askFrom:txt("ask-from"),error:vis("error-view")?txt("error-view"):null};'
  + 'if(!out.form){document.title="PROBE"+JSON.stringify(out);return;}'
  + 'document.getElementById("rec-name").value="Masseria Moroseta";'
  + 'document.getElementById("submit-btn").click();'
  + 'setTimeout(function(){out.thanksShown=vis("thanks-view");out.thanks=txt("thanks-view");'
  + 'document.title="PROBE"+JSON.stringify(out);},400);'
  + '},300);});'
  + '})();</' + 'script>';

function render(meta, recv) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respond-words-'));
  try {
    fs.writeFileSync(path.join(tmp, 'p.html'), respond.replace('<head>', '<head>' + stub(meta, recv)), 'utf8');
    const outer = path.join(tmp, 'o.html');
    fs.writeFileSync(outer, '<!doctype html><html><body style="margin:0">'
      + '<iframe id="f" src="p.html?t=tok" style="width:390px;height:900px;border:0"></iframe>'
      + '<script>setInterval(function(){try{var t=document.getElementById("f").contentDocument.title;'
      + 'if(t&&t.indexOf("PROBE")===0)document.title=t;}catch(e){}},120);</' + 'script>'
      + '</body></html>', 'utf8');
    let dump = '';
    try {
      dump = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
        '--allow-file-access-from-files', '--virtual-time-budget=6000',
        '--window-size=400,900', '--dump-dom',
        'file:///' + outer.split(path.sep).join('/')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
    } catch (e) { dump = ''; }
    const m = dump.match(/<title>PROBE(\{[\s\S]*?\})<\/title>/);
    // dump-dom escapes the title text; undo the three it uses.
    try { return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : null; }
    catch (e) { return null; }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const Q = { requester_name: 'Tal', query_text: 'Where should we eat in Lecce?' };

if (!CHROME) {
  console.log('  ..    no Chrome here; section 2 skipped');
} else {
  // A · someone with no account answers a question asked of a named circle
  const a = render(Object.assign({ circle_name: 'Puglia trip' }, Q),
                   { success: true, answerer_on_trustnet: false });
  ck('A · the page rendered and the probe reported', !!a);
  if (a) {
    const t = norm(a.thanks);
    console.log('        screen: ' + t.slice(0, 400));
    ck('A · the question line still names the circle (dan chose B)',
       a.askFrom === 'Tal is asking their Puglia trip circle', JSON.stringify(a.askFrom));
    ck('A · the thank-you screen is showing', a.thanksShown === true);
    ck('A · it is still personal: "Sent to Tal!"', /Sent to Tal!/.test(t));
    // dan, 7 Oct: keep "Sent to Tal", lose the two lines between it and the pitch.
    ck('A · the line under it is gone', !/You just gave/.test(t));
    ck('A · the TRUSTED VOICE badge is gone', !/TRUSTED VOICE/i.test(t));
    ck('A · "Free. Takes a minute." is gone', !/Takes a minute/.test(t));
    ck('A · the headline asks for their own question', /Have a question of your own\?/.test(t), t.slice(0, 160));
    ck('A · the body is the approved sentence, word for word',
       !!TN_WHAT_IT_IS && t.indexOf(norm(TN_WHAT_IT_IS)) >= 0);
    ck('A · it does not tell them they are in a circle', !/has you in their/.test(t));
    ck('A · it does not lead on where things are kept', !/keeps them/.test(t));
    ck('A · the third pitch is gone', !/No ads, no strangers/.test(t));
    ck('A · no email-only small print', !/email this request/.test(t));
    ck('A · the button is there', /Get your own Trustnet/.test(t));
  }

  // B · the circle has no name to show
  const b = render(Object.assign({ circle_name: '' }, Q),
                   { success: true, answerer_on_trustnet: false });
  ck('B · the page rendered', !!b);
  if (b) {
    ck('B · with no circle name the line reads "Tal is asking"',
       b.askFrom === 'Tal is asking', JSON.stringify(b.askFrom));
  }

  // C · someone already on Trustnet answers: no pitch, just the way back
  const c = render(Object.assign({ circle_name: 'Puglia trip' }, Q),
                   { success: true, answerer_on_trustnet: true });
  ck('C · the page rendered', !!c);
  if (c) {
    const t = norm(c.thanks);
    ck('C · a member gets "Back to Trustnet"', /Back to Trustnet/.test(t), t.slice(0, 120));
    ck('C · ...and is not pitched to', !/Get your own Trustnet|Have a question of your own/.test(t));
  }

  // D · the link was already used
  const d = render(Object.assign({ used: true }, Q), {});
  ck('D · the page rendered', !!d);
  if (d) {
    ck('D · the used-link screen is showing', !!d.error, JSON.stringify(d));
    ck('D · ...and names no channel', !/Gmail|email/.test(d.error || ''), JSON.stringify(d.error));
  }
}

// ── 3 · WHAT THE PAGES PROMISE ─────────────────────────────────────────────
console.log('\n  the written promise:');

const privacy = pageText(read(PRIVACY));
const support = pageText(read(SUPPORT));
ck('privacy no longer says a circle is hidden from the people in it',
   !/not shown to the people in it/.test(privacy),
   'the invitation, the email and the answer page all name the circle');
ck('privacy says the people in it see its name',
   /The people in it see its name/.test(privacy));
ck('...and never who else is in it', /never who else is in it/.test(privacy));
ck('the date line records the change', /7 October 2026/.test(privacy));
ck('the help page agrees with the privacy page',
   /The people in it see its name/.test(support)
   && !/it is not shown to anyone else/.test(support));

// The promise is held to the code in BOTH directions: if someone later takes
// the name off these screens, this fails and the privacy page needs a look.
const sendQuery = read(path.join(REPO, 'supabase', 'functions', 'send-query', 'index.ts'));
ck('true today: the invitation shows the circle name',
   /is inviting you to their ' \+ esc\(d\.circle\)/.test(index));
ck('true today: the question email names the circle',
   /is asking their \$\{circle\.name\} circle/.test(sendQuery));

// "Never who else is in it" stands on RLS. Every policy ever written on
// members, across both migration folders, must be owner-only.
const migDirs = [path.join(REPO, 'supabase', 'migrations'), path.join(REPO, 'migrations')];
const policies = [];
for (const dir of migDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /\.sql$/.test(x))) {
    const src = read(path.join(dir, f));
    const re = /create policy\s+(\w+)\s+on\s+(?:public\.)?members\b([\s\S]*?);/gi;
    let m;
    while ((m = re.exec(src))) policies.push({ file: f, name: m[1], body: m[2] });
  }
}
ck('there is a policy on members to read at all', policies.length > 0);
const loose = policies.filter((p) => !/using\s*\(\s*owner_id\s*=\s*auth\.uid\(\)\s*\)/i.test(p.body));
ck('every policy on members is owner-only',
   policies.length > 0 && loose.length === 0,
   loose.map((p) => p.file + ':' + p.name).join(', '));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
if (useOld) {
  console.log(fail > 0
    ? '  CONTROL OK \u2014 the baselines fail, so the checks above measure the fix.\n'
    : '  CONTROL BROKEN \u2014 the baselines PASS. These checks measure nothing.\n');
}
process.exit(fail ? 1 : 0);
