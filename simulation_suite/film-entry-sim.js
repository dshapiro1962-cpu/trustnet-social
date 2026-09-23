// film-entry-sim.js — the way into the film, on the screen a new member sees.
//
// dan, 23 Sep: "the menu is not the place its buried a new user will not go to
// the menue it has to be present on the onboarding page so that if a new user
// wants he can click on it".
//
// So the card sits above the steps, and it carries a real frame of the film
// rather than a line of text: a still says what is behind it, where text asks
// you to imagine. It opens the film FULL SCREEN INSIDE THE APP, so closing it
// returns them mid-onboarding instead of leaving a second browser tab.
//
// WHAT THIS RUNS
//   1. the REAL onboarding rendered in headless Chrome at 390px, with the card
//      USED: tapped, the player opened, closed again
//   2. the thumbnail is checked as a FILE THAT EXISTS, at the path the markup
//      asks for - a broken image would look like a broken product, and it is
//      exactly the kind of thing a source-only check would miss
//   3. the film the player loads is the real /film page
//
//   node film-entry-sim.js         -> must PASS
//   node film-entry-sim.js --old   -> index.pre-v0.99.0.html, must FAIL

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const useOld = process.argv.indexOf('--old') > -1;
const WEB = path.join(__dirname, '..', 'web');
const PAGE = useOld ? path.join(__dirname, 'index.pre-v0.99.0.html') : path.join(WEB, 'index.html');
if (!fs.existsSync(PAGE)) { console.error('missing fixture: ' + PAGE); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(JSON.stringify(x)).slice(0, 170) : '')); }
};
const html = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');

console.log('\n   fixture: ' + path.basename(PAGE) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1 · the things it needs to exist at all ────────────────────────────────
console.log('== what has to be there ==\n');
const thumbSrc = (html.match(/class="tn-film-th"><img src="([^"]+)"/) || [])[1];
ck('the card asks for a thumbnail', !!thumbSrc, thumbSrc);
ck('...and that file is really in web/, so it cannot render broken',
   !!thumbSrc && fs.existsSync(path.join(WEB, thumbSrc)), thumbSrc);
if (thumbSrc && fs.existsSync(path.join(WEB, thumbSrc))) {
  const kb = fs.statSync(path.join(WEB, thumbSrc)).size / 1024;
  ck('...and is small enough to sit on a first screen', kb < 120, Math.round(kb) + 'kb');
}
ck('the film it plays is the page that is actually deployed',
   fs.existsSync(path.join(WEB, 'film.html')));
ck('the player has somewhere to mount', /id="film-root"/.test(html));

// ── 2 · MVP, on the version line ───────────────────────────────────────────
console.log('\n== the version line ==\n');
ck('the strip says MVP', /<span id="beta-strip-tag">MVP<\/span>/.test(html));
ck('...and no longer says BETA there', !/<span id="beta-strip-tag">BETA<\/span>/.test(html));
// Taste Match is a different claim: that FEATURE is still unfinished.
ck('[guard] the Taste Match beta mark is left alone', /class="tn-beta"[^>]*>BETA</.test(html));

// ── 3 · the screen, used ───────────────────────────────────────────────────
console.log('\n== the card, on a phone ==\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  console.log('  (no Chrome here — the screen cannot be checked, and this does not pass without it)');
  fail++;
} else {
  const TMP = process.env.TEMP || process.env.TMP || '.';
  const probe = `
<script>
showLoginScreen = function () {};
window.addEventListener('load', function () {
  var out = {};
  var VB = function () { return document.getElementById('view-body'); };
  var click = function (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  (async function () {
    try {
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      Object.defineProperty(navigator, 'userAgent', { value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
        configurable: true });
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
      window.matchMedia = function () { return { matches: false, addEventListener: function () {} }; };
      AppState.userProfile = { id: 'u0', name: 'Naama', avatar: 'N', avatarColor: '#B0643E' };
      AppState._feedFetched = true; AppState._notifFetched = true;
      AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = [];
      AppState.userCanonicals = []; AppState.userQueries = []; AppState._notifications = [];
      try { localStorage.removeItem('tn_a2hs_skipped'); } catch (e) {}
      showView('home');

      var card = VB().querySelector('.tn-film');
      out.card = !!card;
      out.text = card ? card.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.img = card ? (card.querySelector('img') || {}).getAttribute('src') : null;
      // ABOVE the steps, and not inside them.
      var steps = VB().querySelector('.tn-steps-h');
      out.aboveSteps = !!(card && steps &&
        (card.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
      out.notAStep = card ? !card.classList.contains('tn-step') : false;
      var r = card ? card.getBoundingClientRect() : null;
      out.visible = !!r && r.top >= 0 && r.bottom <= window.innerHeight && r.width > 200;
      // The gate still has to be reachable with the card above it.
      var last = VB().querySelectorAll('.tn-step');
      var lr = last.length ? last[last.length - 1].getBoundingClientRect() : null;
      out.stepsStillFit = !!lr && lr.bottom <= window.innerHeight;
      out.overflow = document.documentElement.scrollWidth;

      // USE IT.
      click(card);
      await wait(60);
      var player = document.querySelector('#film-root .tn-player');
      out.opened = !!player;
      out.frame = player ? (player.querySelector('iframe') || {}).getAttribute('src') : null;
      out.hasClose = player ? !!player.querySelector('[data-action=close-film]') : false;
      // It must cover the screen, not sit in the page.
      if (player) {
        var pr = player.getBoundingClientRect();
        out.fullScreen = pr.width >= window.innerWidth - 1 && pr.height >= window.innerHeight - 1;
      }
      click(player.querySelector('[data-action=close-film]'));
      await wait(40);
      out.closed = !document.querySelector('#film-root .tn-player');
      out.backToOnboarding = !!VB().querySelector('.tn-step');

      // Once there is nothing left to set up, the card goes.
      AppState.userCircles = [{ id: 'c1', ownerId: 'u0', name: 'Travel', domain: 'travel',
        color: '#1D5A45', description: '', location: '', isOwn: true, memberIds: ['m1'] }];
      AppState.userMembers = [{ id: 'm1', circleId: 'c1', name: 'Tal', avatar: 'T',
        avatarColor: '#B0643E', contactMethod: 'whatsapp', contactValue: '+972500000001',
        isExternalSource: false, linkedUserId: null }];
      AppState.userQueries = [{ id: 'q1', circleId: 'c1', text: 'x', degree: 1, status: 'sent',
        sentAt: new Date().toISOString(), resolvedAt: null, chosenResponseId: null, responses: [] }];
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
      window.matchMedia = function () { return { matches: true, addEventListener: function () {} }; };
      renderApp();
      out.goneWhenDone = !VB().querySelector('.tn-film');
    } catch (e) {
      out.threw = String((e && e.message) || e) + ' @ ' + String((e && e.stack || '').split('\\n')[1] || '').trim();
    }
    try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e) {}
  })();
});
</` + `script>`;

  const inner = path.join(TMP, 'tn-film-inner.html');
  fs.writeFileSync(inner, html.replace('</body>', probe + '</body>'), 'utf8');
  const outer = path.join(TMP, 'tn-film-outer.html');
  fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
    + '<iframe src="' + path.basename(inner) + '" style="width:390px;height:844px;border:0"></iframe>'
    + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
  let dom = '';
  try {
    dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,844',
      '--virtual-time-budget=9000', '--dump-dom', 'file:///' + outer.split(path.sep).join('/')],
      { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = String(e.stdout || ''); }
  const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
  const r = m ? JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
    : { threw: 'the page never reported back' };

  ck('the app runs and the probe finishes', !r.threw, r.threw);
  ck('a new member sees the card', r.card === true);
  ck('...saying what it is and how long it takes',
     /See what Trustnet does/.test(r.text || '') && /30 seconds/.test(r.text || ''), r.text);
  ck('...with the still on it', /film-thumb/.test(r.img || ''), r.img);
  ck('...above the steps, not inside them', r.aboveSteps === true && r.notAStep === true, r);
  ck('...and on screen without scrolling', r.visible === true);
  ck('the four steps still fit under it', r.stepsStillFit === true);
  ck('nothing runs off a 390px phone', r.overflow <= 390, r.overflow);
  ck('tapping it opens the film', r.opened === true);
  ck('...full screen, over the app', r.fullScreen === true);
  ck('...from the one film that is deployed', /film\.html/.test(r.frame || ''), r.frame);
  ck('...and it is asked to play ONCE, not loop', /once=1/.test(r.frame || ''), r.frame);
  ck('...with a way out', r.hasClose === true);
  ck('closing it goes back to onboarding', r.closed === true && r.backToOnboarding === true, r);
  ck('and once there is nothing left to set up, the card goes', r.goneWhenDone === true);
}

// ── 4 · what the film does when it reaches the end ─────────────────────────
// dan, 23 Sep: "the question is should it run in a loop". Inside the app it
// must not: it holds on the end card, because a loop drops the viewer back
// into "No more of this" a beat after the payoff. On /film it must keep
// looping, because that page exists to be screen-recorded.
//
// Watching a 29.5-second film twice would make this sim a minute long, so the
// page takes ?speed=N and the clock is hurried. Nothing else about it changes:
// same cues, same order, same ending.
console.log('\n== the end of the film ==\n');
if (fs.existsSync(CHROME) && !useOld) {
  const TMP2 = process.env.TEMP || process.env.TMP || '.';
  const filmPath = path.join(WEB, 'film.html').split(path.sep).join('/');
  const watch = (query) => {
    const outer = path.join(TMP2, 'tn-loop-' + query.replace(/[^a-z0-9]/gi, '') + '.html');
    // DISPLAYED IS NOT REACHABLE. The first version of this asked only whether
    // the replay button was displayed, and it was - sitting inside a beat whose
    // pointer-events were none, so it could not be pressed at all. dan found
    // that on his phone. It now presses the button and checks the film
    // restarted, which is the only claim worth making about a button.
    const probe = 'setTimeout(function(){'
      + 'var w=document.getElementById("f").contentWindow, d=w.document;'
      + 'var on=d.querySelector(".beat.on");'
      + 'var r=d.getElementById("replay");'
      + 'var vis=!!r && w.getComputedStyle(r).display!=="none";'
      + 'var hit=false;'
      // MEASURE BEFORE PRESSING. The first version built this object after the
      // click, so `ended` read false because pressing the button had already
      // cleared it - the test accusing the product of a fault it had caused.
      + 'var before={beat:on?on.id:null,ended:d.body.classList.contains("ended"),replay:vis,reachable:false};'
      + 'if(vis){var b=r.getBoundingClientRect();'
      + 'var top=d.elementFromPoint(b.left+b.width/2,b.top+b.height/2);'
      + 'before.reachable=!!top && (top===r || r.contains(top));'
      + 'r.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));}'
      + 'setTimeout(function(){var on2=d.querySelector(".beat.on");'
      + 'before.afterBeat=on2?on2.id:null;'
      + 'before.afterEnded=d.body.classList.contains("ended");'
      + 'document.title="R"+JSON.stringify(before);},900);'
      + '},5200);';
    fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
      + '<iframe id="f" src="file:///' + filmPath + '?' + query + '" style="width:390px;height:760px;border:0"></iframe>'
      + '<script>' + probe + '</' + 'script></body></html>', 'utf8');
    let dom = '';
    try {
      dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
        '--allow-file-access-from-files', '--window-size=430,800', '--virtual-time-budget=20000',
        '--dump-dom', 'file:///' + outer.split(path.sep).join('/')],
        { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { dom = String(e.stdout || ''); }
    const mm = dom.match(/<title>R([\s\S]*?)<\/title>/);
    return mm ? JSON.parse(mm[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')) : { threw: 'no report' };
  };

  // 29.5s at twelve times speed is under three seconds, so five seconds of
  // wall clock is comfortably past the end.
  const onceRun = watch('once=1&speed=12');
  ck('played once, it stops on the end card', onceRun.beat === 'b6', onceRun);
  ck('...and says it has ended, rather than just freezing', onceRun.ended === true, onceRun);
  ck('...offering to play it again', onceRun.replay === true, onceRun);
  ck('...and that offer can actually be pressed, not just seen',
     onceRun.reachable === true, onceRun);
  // Not "back to beat 1": at twelve times speed, 900ms later the film is
  // already several beats in. What matters is that it is RUNNING again.
  ck('...pressing it starts the film over',
     onceRun.afterEnded === false && onceRun.afterBeat && onceRun.afterBeat !== 'b6', onceRun);

  const loopRun = watch('speed=12');
  ck('/film itself is still looping, for recording a take', loopRun.beat !== 'b6', loopRun);
  ck('...and never offers a replay button', loopRun.replay === false, loopRun);
} else if (!useOld) {
  console.log('  (no Chrome here — the ending cannot be watched, and this does not pass without it)');
  fail++;
}

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
