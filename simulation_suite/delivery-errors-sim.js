// delivery-errors-sim.js - a question with a line break reaches WhatsApp, and a
// failed delivery is explained in a sentence.
//
// WHAT HAPPENED. 19 Sep: Tchiya asked her London circle
//     "Would love to get recommendation for hotel in London,<Enter>Thank you"
// and Rakefet, reached by WhatsApp, never got it. Meta refuses a template
// parameter containing a new-line, a tab or more than four consecutive spaces
// (error 132018) - and refuses the WHOLE message. send-query passed the
// question through with .trim(), which only touches the ends. The screen then
// showed Meta's raw JSON, cut off at 200 characters.
//
// Both strings below are copied from that row in production, verbatim.
//
// WHAT THIS RUNS
//   1. the REAL waParam from supabase/functions/_shared/channels.ts, in a vm
//      (types stripped - there is no Deno here), on her exact question
//   2. the source: every WhatsApp parameter goes through waParam, and nothing
//      else builds template parameters behind its back
//   3. the REAL deliveryErrorText from web/index.html, on her exact error and
//      the other errors the servers can produce
//   4. the delivery strip RENDERED in headless Chrome at phone width, with her
//      exact error: a sentence on screen, the raw text folded under Details
//
//   node delivery-errors-sim.js         -> must PASS
//   node delivery-errors-sim.js --old   -> *.pre-v0.95.2.*, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const cp = require('child_process');

const useOld = process.argv.indexOf('--old') > -1;
const CHANNELS = useOld ? path.join(__dirname, 'channels.pre-v0.95.2.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'channels.ts');
const PAGE = useOld ? path.join(__dirname, 'index.pre-v0.95.2.html')
  : path.join(__dirname, '..', 'web', 'index.html');
for (const f of [CHANNELS, PAGE]) if (!fs.existsSync(f)) { console.error('missing fixture: ' + f); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

// Production, verbatim.
const TCHIYA_TEXT = 'Would love to get recommendation for hotel in London,\nThank you';
const TCHIYA_ERR = 'whatsapp_400: {"error":{"message":"(#132018) There\u2019s an issue with the parameters in your template","code":132018,"type":"OAuthException","error_data":{"messaging_product":"whatsapp","details":"Param text cannot ha';

// Meta's rule, as its own error message states it.
const waRefuses = (t) => /[\r\n\t]/.test(t) || / {5,}/.test(t);

console.log('\n   fixtures: ' + path.basename(CHANNELS) + ', ' + path.basename(PAGE) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1. the server's flattening ─────────────────────────────────────────────
console.log('== 1. what WhatsApp is sent ==\n');
const ts = fs.readFileSync(CHANNELS, 'utf8');
let waParam = null;
const at = ts.indexOf('export function waParam(');
if (at > -1) {
  const end = ts.indexOf('\n}\n', at) + 2;
  const js = ts.slice(at, end).replace('export ', '').replace('(t: string): string', '(t)');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(js + ';this.waParam = waParam;', ctx);
  waParam = ctx.waParam;
}
ck('the shared WhatsApp sender has a parameter cleaner', typeof waParam === 'function');
if (waParam) {
  const out = waParam(TCHIYA_TEXT);
  ck("[precondition] Tchiya's question, as stored, is one WhatsApp refuses", waRefuses(TCHIYA_TEXT));
  ck('...and after cleaning, WhatsApp accepts it', !waRefuses(out), JSON.stringify(out));
  ck('...reading as she wrote it, on one line',
     out === 'Would love to get recommendation for hotel in London, Thank you', JSON.stringify(out));
  const cases = {
    'Windows line endings and a blank line': 'line one\r\n\r\nline two',
    'a tab': 'hotel\tLondon',
    'six spaces': 'hotel      London',
    'a Unicode line separator': 'hotel\u2028London',
    'Hebrew, with a line break': '\u05de\u05d7\u05e4\u05e9 \u05de\u05dc\u05d5\u05df\n\u05ea\u05d5\u05d3\u05d4',
    'spaces and breaks at both ends': '  \n hotel in London \n  ',
  };
  Object.keys(cases).forEach((k) => ck(k + ' is cleaned', !waRefuses(waParam(cases[k])), JSON.stringify(waParam(cases[k]))));
  ck('Hebrew letters come through untouched',
     waParam(cases['Hebrew, with a line break']) === '\u05de\u05d7\u05e4\u05e9 \u05de\u05dc\u05d5\u05df \u05ea\u05d5\u05d3\u05d4');
  ck('an ordinary question is left exactly as it was', waParam('Hotels and restaurants in Apulia?') === 'Hotels and restaurants in Apulia?');
  const long = waParam('x '.repeat(1500));
  ck('a very long question is capped under the 1024-character template limit', long.length <= 700, String(long.length));
}

// ── 2. nothing goes round it ───────────────────────────────────────────────
console.log('\n== 2. every WhatsApp message goes through it ==\n');
ck('sendWhatsApp cleans EVERY parameter',
   /parameters:\s*bodyParams\.map\(\(t\)\s*=>\s*\(\{\s*type:\s*"text",\s*text:\s*waParam\(t\)\s*\}\)\)/.test(ts));
const fnDir = path.join(__dirname, '..', 'supabase', 'functions');
const others = [];
fs.readdirSync(fnDir).forEach((d) => {
  const f = path.join(fnDir, d, 'index.ts');
  if (!fs.existsSync(f)) return;
  const src = fs.readFileSync(f, 'utf8');
  if (/graph\.facebook\.com[\s\S]{0,400}type:\s*"template"/.test(src) || /components:\s*\[/.test(src)) others.push(d);
});
ck('no function builds its own WhatsApp template around the cleaner', others.length === 0, others.join(', '));
['send-query', 'resend-member'].forEach((d) => {
  const src = fs.readFileSync(path.join(fnDir, d, 'index.ts'), 'utf8');
  ck(d + ' sends WhatsApp through the shared sender', /import \{[^}]*sendWhatsApp[^}]*\} from "\.\.\/_shared\/channels\.ts"/.test(src));
});
// Sending a LIST never sends a template: it hands the sender a wa.me link and
// they send the text themselves, where a line break is fine. (Assumed
// otherwise when this was first written; the source says so at line 6.)
const sc = fs.readFileSync(path.join(fnDir, 'send-collection', 'index.ts'), 'utf8');
ck('[precondition] sending a list hands over a wa.me link rather than a template',
   /status = "manual"/.test(sc) && !/sendWhatsApp\(/.test(sc));

// ── 3. the sentence ────────────────────────────────────────────────────────
console.log('\n== 3. a failed delivery, in words ==\n');
const html = fs.readFileSync(PAGE, 'utf8');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');
let words = null;
const w = script.indexOf('function deliveryErrorText(');
if (w > -1) {
  const end = script.indexOf('\n}\n', w) + 2;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(script.slice(w, end) + ';this.f = deliveryErrorText;', ctx);
  words = ctx.f;
}
ck('the app has a way to say what went wrong', typeof words === 'function');
const clean = (t) => !/[{}"#]|whatsapp_|email_|OAuth|_\d{3}/.test(t);
if (words) {
  const t = words(TCHIYA_ERR);
  ck("Tchiya's error becomes a sentence", clean(t), t);
  ck('...that names the cause', /line break/.test(t), t);
  ck('...and says what to do', /Resend/.test(t), t);
  const samples = {
    'not on WhatsApp': ['whatsapp_400: {"error":{"message":"(#131026) Message undeliverable.","type":"OAuthException","code":131026', /can.t receive WhatsApp/],
    'test-mode number': ['whatsapp_400: {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030', /test mode/],
    'expired token': ['whatsapp_401: {"error":{"message":"Error validating access token","type":"OAuthException","code":190', /on our side/],
    'WhatsApp not set up': ['whatsapp_not_configured', /on our side/],
    'WhatsApp unreachable': ['whatsapp_exception: TypeError: fetch failed', /couldn.t reach WhatsApp/],
    'email refused': ['email_422: {"name":"validation_error","message":"Invalid `to` field."}', /email address was refused/],
    'nobody to reach': ['member_not_linked', /no number or email/],
    'something unknown': ['unknown', /didn.t go through/],
  };
  Object.keys(samples).forEach((k) => {
    const out = words(samples[k][0]);
    ck(k + ': "' + out + '"', clean(out) && samples[k][1].test(out));
  });
  ck('when sending a list there is no Resend to point at, so it does not', !/Resend/.test(words(TCHIYA_ERR, 'list')), words(TCHIYA_ERR, 'list'));
}

// ── 4. the screen ──────────────────────────────────────────────────────────
console.log('\n== 4. the delivery strip, rendered ==\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  console.log('  (no Chrome here - the render check is skipped, and so is a PASS)');
  fail++;
} else {
  const TMP = process.env.TEMP || process.env.TMP || '.';
  const shim = '<script>showLoginScreen = function () {};'
    + 'window.addEventListener("load", function () { setTimeout(function () { var out = {};'
    + 'try {'
    + ' document.getElementById("loading-screen").style.display = "none"; document.getElementById("login").style.display = "none"; document.getElementById("app").style.display = "flex";'
    + ' AppState.userProfile = { id: "u0", name: "Tchiya" }; AppState._feedFetched = true; AppState._notifFetched = true;'
    + ' AppState.userCircles = [{ id: "c1", ownerId: "me", name: "London", domain: "travel", color: "#1D5A45", description: "", location: "", isOwn: true, memberIds: ["m9"] }];'
    + ' AppState.userMembers = [{ id: "m9", circleId: "c1", name: "Rakefet", avatar: "R", avatarColor: "#B0643E", contactMethod: "whatsapp", contactValue: "+972548150172", isExternalSource: false, linkedUserId: null }];'
    + ' AppState.queryState = { phase: "sent", queryId: "q9", circleId: "c1", text: ' + JSON.stringify(TCHIYA_TEXT) + ', responses: [], visibleCount: 0,'
    + '   deliveries: [{ member_id: "m9", member: "Rakefet", channel: "whatsapp", status: "failed", error: ' + JSON.stringify(TCHIYA_ERR) + ' }] };'
    + ' showView("query");'
    + ' var strip = document.getElementById("q-delivery-strip");'
    + ' var copy = strip ? strip.cloneNode(true) : null; if (copy) copy.querySelectorAll("details").forEach(function (d) { d.remove(); });'
    + ' out.shown = copy ? copy.textContent : ""; out.folded = strip ? [].map.call(strip.querySelectorAll("details"), function (d) { return d.textContent; }).join("") : "";'
    + ' out.resend = strip ? strip.querySelectorAll("[data-action=resend-member]").length : 0;'
    + '} catch (e) { out.threw = String(e && e.message || e); }'
    + ' try { parent.postMessage("R" + JSON.stringify(out), "*"); } catch (e) {} }, 300); });</' + 'script>';
  const inner = path.join(TMP, 'tn-des-inner.html');
  fs.writeFileSync(inner, html.replace('</body>', shim + '</body>'), 'utf8');
  const outer = path.join(TMP, 'tn-des-outer.html');
  fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
    + '<iframe src="' + path.basename(inner) + '" style="width:390px;height:844px;border:0"></iframe>'
    + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
  let dom = '';
  try {
    dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,844', '--virtual-time-budget=6000', '--dump-dom',
      'file:///' + outer.split(path.sep).join('/')], { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = String(e.stdout || ''); }
  const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
  const r = m ? JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')) : { threw: 'never rendered' };
  ck('the screen after asking draws', !r.threw, r.threw);
  ck('it tells Tchiya why, in a sentence', /line break/.test(r.shown || ''), (r.shown || '').slice(0, 160));
  ck("...and Meta's raw reply is not what she reads", !/\{"error"|whatsapp_400|OAuthException/.test(r.shown || ''), (r.shown || '').slice(0, 160));
  ck('...though it is still there, folded under Details, for whoever fixes it', /132018/.test(r.folded || ''));
  ck('...next to the Resend button', r.resend === 1, String(r.resend));
}

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
