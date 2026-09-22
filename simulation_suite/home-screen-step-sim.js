// home-screen-step-sim.js — step 1: put Trustnet on your home screen (v0.98.0).
//
// dan, 22 Sep: "i think like with a real app it should gate". So the first
// thing a new member does is put Trustnet on their home screen, and the three
// steps that follow are locked until they have.
//
// WHY IT EXISTS AT ALL: nothing in the product had ever mentioned the home
// screen, although the manifest, the icons and display:standalone were all
// there and correct. dan could not find the option in Chrome on his iPhone
// because it is in the SHARE menu beside the address, not the three-dot menu -
// and once he found it, the icon opened standalone and still signed in, which
// is what makes the step verifiable at all.
//
// WHAT THIS RUNS
//   1. the REAL tnPlatform() over real user-agent strings, in a vm: six
//      devices, each asserted to produce the branch it must
//   2. the REAL renderOnboarding in headless Chrome at 390px, once per device:
//      the step, the gate, the sheet it opens, and the escape - all USED
//   3. the tick: display-mode standalone, and the step is done
//
//   node home-screen-step-sim.js         -> must PASS
//   node home-screen-step-sim.js --old   -> index.pre-v0.98.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const cp = require('child_process');

const useOld = process.argv.indexOf('--old') > -1;
const PAGE = useOld ? path.join(__dirname, 'index.pre-v0.98.0.html')
                    : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(PAGE)) { console.error('missing fixture: ' + PAGE); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(JSON.stringify(x)).slice(0, 170) : '')); }
};
const html = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');

console.log('\n   fixture: ' + path.basename(PAGE) + (useOld ? '   (must FAIL)' : '') + '\n');

// Real strings, as these devices actually send them.
const UAS = {
  'Chrome on an iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  'Safari on an iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  "WhatsApp's browser on an iPhone": 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/WhatsApp;FBAV/24.12.0]',
  'Chrome on Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  "WhatsApp's browser on Android": 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 WhatsApp/2.24.12.78',
  'a laptop': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

// ── 1 · the branch table ───────────────────────────────────────────────────
console.log('== 1. what each device is taken to be ==\n');
let tnPlatform = null;
{
  const at = script.indexOf('function tnPlatform(');
  if (at > -1) {
    const end = script.indexOf('\n}\n', at) + 2;
    const ctx = {};
    vm.createContext(ctx);
    try {
      vm.runInContext(script.slice(at, end) + '\nthis.f = tnPlatform;', ctx);
      tnPlatform = (ua, standalone) => {
        ctx.navigator = { userAgent: ua, standalone: !!standalone };
        ctx.window = { matchMedia: () => ({ matches: !!standalone }) };
        return ctx.f();
      };
    } catch (e) { /* reported below */ }
  }
}
ck('the app can tell where it is being used', typeof tnPlatform === 'function');
if (tnPlatform) {
  const want = {
    'Chrome on an iPhone': { phone: true, ios: true, chromeIOS: true, inWhatsApp: false },
    'Safari on an iPhone': { phone: true, ios: true, chromeIOS: false, inWhatsApp: false },
    "WhatsApp's browser on an iPhone": { phone: true, ios: true, inWhatsApp: true },
    'Chrome on Android': { phone: true, android: true, inWhatsApp: false },
    "WhatsApp's browser on Android": { phone: true, android: true, inWhatsApp: true },
    'a laptop': { phone: false, ios: false, android: false, inWhatsApp: false },
  };
  Object.keys(want).forEach((name) => {
    const got = tnPlatform(UAS[name], false);
    const ok = Object.keys(want[name]).every((k) => got[k] === want[name][k]);
    ck(name + ' is read correctly', ok, got);
  });
  ck('a laptop is never asked to add a home-screen icon', tnPlatform(UAS['a laptop'], false).phone === false);
  ck('opening from the icon is detected, which is what ticks the step',
     tnPlatform(UAS['Chrome on an iPhone'], true).standalone === true);
  ck('...and is false in an ordinary tab',
     tnPlatform(UAS['Chrome on an iPhone'], false).standalone === false);
}

// ── 2 · the screens ────────────────────────────────────────────────────────
console.log('\n== 2. the step, the gate, and the sheet ==\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  console.log('  (no Chrome here — the screens cannot be checked, and this does not pass without it)');
  fail++;
} else {
  const TMP = process.env.TEMP || process.env.TMP || '.';
  const probe = `
<script>
showLoginScreen = function () {};
window.addEventListener('load', function () {
  var out = {};
  var VB = function () { return document.getElementById('view-body'); };
  var MR = function () { return document.getElementById('modal-root'); };
  var click = function (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var UAS = ${JSON.stringify(UAS)};
  var fake = function (ua, standalone) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    Object.defineProperty(navigator, 'standalone', { value: !!standalone, configurable: true });
    window.matchMedia = function () { return { matches: !!standalone, addEventListener: function () {} }; };
  };
  (async function () {
    try {
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      AppState.userProfile = { id: 'u0', name: 'Naama', avatar: 'N', avatarColor: '#B0643E' };
      AppState._feedFetched = true; AppState._notifFetched = true;
      AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = [];
      AppState.userCanonicals = []; AppState.userQueries = []; AppState._notifications = [];
      try { localStorage.removeItem('tn_a2hs_skipped'); } catch (e) {}

      // ── an iPhone, in Chrome, in a tab ──────────────────────────────
      fake(UAS['Chrome on an iPhone'], false);
      showView('home');
      var vb = VB();
      out.head = (vb.querySelector('.tn-steps-h') || {}).textContent || '';
      var steps = vb.querySelectorAll('.tn-step');
      out.stepCount = steps.length;
      out.first = steps[0] ? steps[0].textContent.replace(/\\s+/g, ' ').trim() : '';
      out.firstIsOn = steps[0] ? steps[0].classList.contains('on') : false;
      out.lockedAfter = [].filter.call(steps, function (s, i) {
        return i > 0 && !s.classList.contains('on') && !s.classList.contains('done'); }).length;
      out.lockedAreButtons = [].every.call([].slice.call(steps, 1), function (s) {
        return s.tagName === 'BUTTON' && s.dataset.modal === 'home-screen'; });

      // Tapping a LOCKED step must teach, not refuse.
      click(steps[1]);
      await wait(40);
      out.sheetFromLocked = !!MR().querySelector('.modal');
      var sheet = MR().querySelector('.modal');
      out.sheetText = sheet ? sheet.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.routes = sheet ? [].map.call(sheet.querySelectorAll('.tn-a2-h'), function (h) { return h.textContent.trim(); }) : [];
      out.chromeFirst = (out.routes[0] || '').toLowerCase().indexOf('chrome') > -1;
      closeModal();

      // ── the same phone, opened from the icon ────────────────────────
      fake(UAS['Chrome on an iPhone'], true);
      renderApp();
      var st2 = VB().querySelectorAll('.tn-step');
      out.doneFirst = st2[0] ? st2[0].classList.contains('done') : false;
      out.doneText = st2[0] ? st2[0].textContent.replace(/\\s+/g, ' ').trim() : '';
      out.unlockedNow = [].filter.call(st2, function (s) { return s.classList.contains('on'); }).length;

      // ── inside WhatsApp, where it cannot be done ────────────────────
      fake(UAS["WhatsApp's browser on an iPhone"], false);
      renderApp();
      out.waFirst = (VB().querySelector('.tn-step') || {}).textContent || '';
      click(VB().querySelector('.tn-step'));
      await wait(40);
      var waSheet = MR().querySelector('.modal');
      out.waSheet = waSheet ? waSheet.textContent.replace(/\\s+/g, ' ').trim() : '';

      // ── the escape, used ────────────────────────────────────────────
      click(MR().querySelector('[data-action=a2hs-skip]'));
      await wait(40);
      out.afterSkipLocked = [].filter.call(VB().querySelectorAll('.tn-step'), function (s) {
        return s.dataset && s.dataset.modal === 'home-screen'; }).length;
      out.afterSkipOn = [].filter.call(VB().querySelectorAll('.tn-step'), function (s) {
        return s.classList.contains('on'); }).length;
      out.afterSkipHead = (VB().querySelector('.tn-steps-h') || {}).textContent || '';
      try { localStorage.removeItem('tn_a2hs_skipped'); } catch (e) {}

      // ── a laptop is never gated ─────────────────────────────────────
      fake(UAS['a laptop'], false);
      renderApp();
      out.laptopHead = (VB().querySelector('.tn-steps-h') || {}).textContent || '';
      out.laptopFirst = (VB().querySelector('.tn-step') || {}).textContent || '';
      out.laptopOn = [].filter.call(VB().querySelectorAll('.tn-step'), function (s) {
        return s.classList.contains('on'); }).length;

      // ── Android says Android's menu ─────────────────────────────────
      fake(UAS['Chrome on Android'], false);
      renderApp();
      click(VB().querySelector('.tn-step'));
      await wait(40);
      var aSheet = MR().querySelector('.modal');
      out.androidSheet = aSheet ? aSheet.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.androidRoutes = aSheet ? aSheet.querySelectorAll('.tn-a2-h').length : 0;
      out.overflow = document.documentElement.scrollWidth;
    } catch (e) {
      out.threw = String((e && e.message) || e) + ' @ ' + String((e && e.stack || '').split('\\n')[1] || '').trim();
    }
    try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e) {}
  })();
});
</` + `script>`;

  const inner = path.join(TMP, 'tn-a2hs-inner.html');
  fs.writeFileSync(inner, html.replace('</body>', probe + '</body>'), 'utf8');
  const outer = path.join(TMP, 'tn-a2hs-outer.html');
  fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
    + '<iframe src="' + path.basename(inner) + '" style="width:390px;height:844px;border:0"></iframe>'
    + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
  let dom = '';
  try {
    dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,844',
      '--virtual-time-budget=10000', '--dump-dom', 'file:///' + outer.split(path.sep).join('/')],
      { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = String(e.stdout || ''); }
  const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
  const r = m ? JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
    : { threw: 'the page never reported back' };

  ck('the app runs and the probe finishes', !r.threw, r.threw);
  console.log('  -- on a phone, in a tab --');
  ck('the home screen is the FIRST step', /Put Trustnet on your home screen/.test(r.first || ''), r.first);
  ck('...and it is the live one', r.firstIsOn === true);
  ck('...of four', /Step 1 of 4/.test(r.head || ''), r.head);
  ck('the three that follow are locked behind it', r.lockedAfter === 3, r.lockedAfter);
  ck('...and tapping one teaches instead of refusing', r.sheetFromLocked === true && r.lockedAreButtons === true, r);

  console.log('  -- the sheet --');
  ck('it gives Chrome first, as dan used', r.chromeFirst === true, r.routes);
  ck('...and Safari too, just in case', (r.routes || []).some((x) => /safari/i.test(x)), r.routes);
  ck('Chrome iOS is sent to the SHARE button, not the three dots',
     /beside the address/.test(r.sheetText || '') && !/\u22ef at the bottom of Chrome/.test(r.sheetText || ''),
     (r.sheetText || '').slice(0, 150));
  ck('...and it promises the tick', /ticks itself/.test(r.sheetText || ''));
  ck('...and says they stay signed in', /stay signed in/.test(r.sheetText || ''));

  console.log('  -- opened from the icon --');
  ck('the step ticks itself', r.doneFirst === true && /On your home screen/.test(r.doneText || ''), r.doneText);
  ck('...and the rest open up', r.unlockedNow >= 1, r.unlockedNow);

  console.log('  -- inside WhatsApp --');
  ck('the step changes job, because it cannot be done there',
     /Open Trustnet in your browser/.test(r.waFirst || ''), r.waFirst);
  ck('...and the sheet sends them to Chrome', /Open in Chrome/.test(r.waSheet || ''), (r.waSheet || '').slice(0, 140));

  console.log('  -- nobody is trapped --');
  ck('"I can\u2019t do this" lets them carry on', r.afterSkipLocked === 0, r.afterSkipLocked);
  ck('...with a live step to get on with', r.afterSkipOn >= 1, r.afterSkipOn);
  ck('...and the count back to three', /of 3/.test(r.afterSkipHead || ''), r.afterSkipHead);
  ck('a laptop is never gated at all',
     /of 3/.test(r.laptopHead || '') && !/home screen/i.test(r.laptopFirst || ''), r.laptopHead + ' / ' + r.laptopFirst);
  ck('...and its first step is live', r.laptopOn >= 1, r.laptopOn);

  console.log('  -- Android --');
  ck('Android is told about its own menu', /at the top right/.test(r.androidSheet || ''), (r.androidSheet || '').slice(0, 140));
  ck('...and is not offered Safari', r.androidRoutes === 1, r.androidRoutes);
  ck('nothing runs off a 390px phone', r.overflow <= 390, r.overflow);
}

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
