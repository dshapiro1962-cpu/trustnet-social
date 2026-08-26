// beta-strip-sim.js — the beta marker cannot be scrolled past, and the version
// is on it.
//
// THE FAILURE, dan 26 Aug: "put somewhere on the home screen the fact that its
// a beta, not at the bottom of the scroll, most important that it will be
// visible on a phone".
//
// The version marker had by then been in three places, each unreadable on the
// device it was checked on:
//
//   #sidebar          — hidden by @media (max-width:768px) on every phone
//   Profile           — its nav entry sits under #mobile-tabbar, unreachable
//   foot of renderHome() — needs a scroll to the end of the longest view
//
// All three shared one shape: the marker lived inside something that could be
// hidden or scrolled. #beta-strip is shell furniture — a sibling of .topbar
// inside #main, above #view-body, which is the only element that scrolls. That
// is the property this sim asserts, structurally rather than by eye.
//
//   node beta-strip-sim.js         → live code, must PASS
//   node beta-strip-sim.js --old   → index.pre-v0.81.0.html, must FAIL

const fs = require('fs');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.81.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');

// ── it exists, and it is furniture ────────────────────────────────────────
console.log('\n-- the strip is part of the shell, not part of a view --\n');

ck('there is a beta strip at all', /id="beta-strip"/.test(html));
ck('it says BETA in the markup, where nothing can fail to render it',
   /<span id="beta-strip-tag">BETA<\/span>/.test(html));

// POSITION IS THE WHOLE POINT. #main is a flex column: everything before
// #view-body is fixed furniture, #view-body is the only scroller. If the strip
// were inside #view-body — or emitted by a render function — it would scroll
// away exactly like the marker it replaced.
const iMain = html.indexOf('<div id="main">');
const iStrip = html.indexOf('id="beta-strip"');
const iTopbar = html.indexOf('<div class="topbar">');
const iBody = html.indexOf('id="view-body"');

ck('it sits inside #main', iStrip > iMain && iMain > -1);
ck('...above the topbar', iStrip > -1 && iStrip < iTopbar,
   'strip@' + iStrip + ' topbar@' + iTopbar);
ck('...and above #view-body, the only element that scrolls',
   iStrip > -1 && iStrip < iBody, 'strip@' + iStrip + ' view-body@' + iBody);
ck('no render function emits it — it is not view content',
   iStrip > -1 && !/beta-strip"/.test(src.replace(/getElementById\('beta-strip-ver'\)/g, '')),
   'a render function that emits the strip would scroll with the view');

// flex-shrink:0 is what stops it being squeezed to nothing when the viewport
// is short — a phone in landscape with the keyboard up.
const cssBlock = (html.match(/#beta-strip \{[\s\S]*?\}/) || [''])[0];
ck('it cannot be squeezed away on a short viewport',
   /flex-shrink:\s*0/.test(cssBlock), cssBlock ? 'no flex-shrink in the rule' : 'no rule at all');
ck('its colours have hardcoded fallbacks, as every critical value here must',
   /background:\s*#FFF3D6/.test(cssBlock) && /border-bottom:\s*1px solid #E8A020/.test(cssBlock));

// STANDALONE MODE HIDES THE TOP 44px. apple-mobile-web-app-capable is yes, so
// added to a home screen the status bar overlays the page — and the strip is
// now the topmost element, so a bare 24px would sit entirely underneath it and
// the marker would be invisible on exactly the device it was built for.
// PRECONDITION, NOT A GUARD — true before and after, and it passes on --old.
// It is here because it is the REASON the next two assertions exist: if this
// meta tag ever goes, the top inset stops mattering and they can go with it.
ck('[precondition] the page can run standalone, so the top inset matters',
   /apple-mobile-web-app-capable"?\s+content="yes"/.test(html));
ck('the strip pads for the status bar', /padding-top:\s*env\(safe-area-inset-top/.test(cssBlock));
ck('...without the fixed-height bug that doubled #mobile-tabbar',
   /box-sizing:\s*border-box/.test(cssBlock)
     && /min-height:\s*24px;\s*height:\s*auto/.test(cssBlock)
     && !/^\s*height:\s*24px/m.test(cssBlock),
   'safe-area padding on a fixed height adds to it instead of insetting');

// ── the version is on it, and driven by the constant ──────────────────────
console.log('\n-- the version rides along, from the constant itself --\n');

const verMatch = src.match(/const APP_VERSION = '([^']+)'/);
ck('APP_VERSION is still declared', !!verMatch);

// RUN THE REAL WIRING. Not a regex over it — the actual IIFE, against a stub
// document, asserting what lands in the element. A guard that only proves a
// line exists cannot tell that line from a broken one.
const wiring = src.match(
  /\(function\(\)\{ var e = document\.getElementById\('beta-strip-ver'\); if \(e\) e\.textContent = APP_VERSION; \}\)\(\);/);
ck('the strip is wired to APP_VERSION', !!wiring);

if (wiring && verMatch) {
  const el = { textContent: '' };
  const stub = { getElementById: (id) => (id === 'beta-strip-ver' ? el : null) };
  new Function('document', 'APP_VERSION', wiring[0])(stub, verMatch[1]);
  ck('...and running it puts the real version on the strip',
     el.textContent === verMatch[1], 'got ' + JSON.stringify(el.textContent));
  ck('...so a version bump can never silently stop showing',
     el.textContent.indexOf('v0.') === 0, el.textContent);
}

// ── the old marker is gone, not merely superseded ─────────────────────────
console.log('\n-- one copy of one fact --\n');

ck('the foot-of-Home marker element is gone',
   !/id="home-version"/.test(html),
   'two copies of the version is how they drift apart');
ck('renderHome no longer emits APP_VERSION',
   !/home-version[\s\S]{0,200}esc\(APP_VERSION\)/.test(src));
// The sidebar footer stays: it is desktop-only furniture, it predates this,
// and it is fed by the same constant in the same place.
ck('the sidebar footer is untouched and still fed by the constant',
   /getElementById\('app-version-footer'\)/.test(src));

console.log('\n  ' + (useOld ? 'BASELINE v0.80.1 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
