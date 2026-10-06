// ═══════════════════════════════════════════════════════════════════════════
// version-check-sim — the app notices when it is out of date, and does not
// make things worse while doing it.
//
// WHY IT EXISTS. On 5 Oct dan tested the same fix four times from his phone
// and reported it broken each time. The fix was live; his home-screen app was
// running a build from before any of it, because iOS keeps a snapshot of a
// page added to the home screen. Neither of us noticed for hours, and every
// screenshot looked like a product that did not work. His testers will hit the
// same thing with no version line to check and nobody to ask.
//
// WHAT THIS ASSERTS is mostly what the checker must NOT do. An auto-reloader
// is a dangerous thing to put in an app: done carelessly it reloads in a loop,
// or throws away what somebody was typing. Those two are tested harder than
// the happy path.
//
// IT RUNS THE REAL FUNCTIONS, lifted out of the page into a vm with fetch,
// sessionStorage, document and location all faked, so the decisions are the
// product's and only the surroundings are the sim's.
//
// BASELINE: index.pre-v0.99.8.html, where no checker exists at all.
//
//   node version-check-sim.js         → live code, must PASS
//   node version-check-sim.js --old   → the baseline, must FAIL
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const INDEX = useOld
  ? path.join(__dirname, 'index.pre-v0.99.8.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(INDEX)) { console.log('\n  FATAL: missing ' + INDEX + '\n'); process.exit(2); }

const web = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const VERSION_JSON = path.join(__dirname, '..', 'web', 'version.json');

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x === undefined ? '' : '   ' + x)); }
};

console.log('\n── the version check ── ' + (useOld ? 'BASELINE v0.99.7' : 'live') + ' ──\n');

// ── 1 · the two files must agree, or the check lies ────────────────────────
// version.json is written by hand beside a version that lives in the client.
// If they drift, a current app reloads itself for ever or a stale one never
// does. This is the assertion that makes a hand-written file safe.
console.log('  the published version:');

const appVersion = (web.match(/const APP_VERSION = '([^']*)'/) || [])[1] || '';
ck('the client declares a version', !!appVersion, appVersion);

let published = null;
if (fs.existsSync(VERSION_JSON)) {
  try { published = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8')).version; }
  catch (e) { published = null; }
}
ck('version.json exists and parses', typeof published === 'string', String(published));
ck('...and says EXACTLY what the client says',
   published === appVersion, JSON.stringify(published) + ' vs ' + JSON.stringify(appVersion));

// ── 2 · run the real decision ──────────────────────────────────────────────
function lift(names) {
  const ctx = {
    console: { log() {}, error() {} },
    APP_VERSION: appVersion,
    Date: Date, JSON: JSON, setTimeout: (f) => f,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  let src = '';
  for (const n of names) {
    const m = web.match(new RegExp('(async )?function ' + n + '\\s*\\('));
    if (!m) return null;
    let depth = 0, i = web.indexOf('{', m.index);
    for (; i < web.length; i++) {
      if (web[i] === '{') depth++;
      else if (web[i] === '}') { depth--; if (depth === 0) break; }
    }
    src += web.slice(m.index, i + 1) + '\n';
  }
  const letM = web.match(/let TN_VERSION_CHECKED = 0;/);
  if (letM) src = letM[0] + '\n' + src;
  try { vm.runInContext(src + '\nthis.__f = { tnCheckVersion, tnSafeToReload };', ctx); }
  catch (e) { return null; }
  return { ctx, f: ctx.__f };
}

const lifted = lift(['tnSafeToReload', 'tnCheckVersion']);
console.log('\n  the real function:');
ck('tnCheckVersion and tnSafeToReload were lifted and run', !!lifted);

if (!lifted) {
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (useOld) {
    console.log(fail > 0 ? '  CONTROL OK — the baseline has no checker at all.\n'
                         : '  CONTROL BROKEN\n');
    process.exit(fail > 0 ? 0 : 1);
  }
  process.exit(1);
}

// A WORLD, AND ITS OWN COPY OF THE FUNCTIONS.
//
// The first version of this sim shared one vm between scenarios and reset the
// throttle with ctx.TN_VERSION_CHECKED = 0. That does nothing: TN_VERSION_CHECKED
// is a `let` INSIDE the lifted script - a lexical binding, not a property of
// the context object. So after the first scenario every later call returned
// early at the throttle, and five "it waits" checks were passing because
// NOTHING RAN AT ALL. One assertion about sessionStorage failed and gave the
// whole thing away.
//
// A fresh vm per scenario removes the shared state rather than trying to reset
// it, which is the only version of this that can be believed.
function world(opts) {
  const o = opts || {};
  const w = {
    reloads: 0, fetched: [], stored: o.stored || {},
    modalHtml: o.modalHtml || '', filmHtml: o.filmHtml || '',
    activeTag: o.activeTag || 'BODY',
    serverVersion: 'serverVersion' in o ? o.serverVersion : appVersion,
    httpOk: o.httpOk !== false,
    throws: !!o.throws,
  };
  const L2 = lift(['tnSafeToReload', 'tnCheckVersion']);
  if (!L2) return null;
  const c = L2.ctx;
  c.APP_VERSION = appVersion;
  c.Date = Date;
  c.location = { pathname: '/', search: '', reload() { w.reloads++; } };
  c.sessionStorage = {
    getItem: (k) => (k in w.stored ? w.stored[k] : null),
    setItem: (k, v) => { w.stored[k] = String(v); },
  };
  c.document = {
    getElementById: (id) => (id === 'modal-root' ? { innerHTML: w.modalHtml }
                           : id === 'film-root' ? { innerHTML: w.filmHtml } : null),
    activeElement: { tagName: w.activeTag },
  };
  c.fetch = (url, init) => {
    w.fetched.push({ url: String(url), cache: init && init.cache });
    if (w.throws) return Promise.reject(new Error('offline'));
    if (String(url).indexOf('version.json') >= 0) {
      return Promise.resolve({
        ok: w.httpOk,
        json: () => Promise.resolve({ version: w.serverVersion }),
      });
    }
    return Promise.resolve({ ok: true });
  };
  w.check = () => L2.f.tnCheckVersion();
  return w;
}

const run = async (w) => { await w.check(); return w; };


(async () => {
  // ── 3 · it reloads when, and only when, it is behind ─────────────────────
  console.log('\n  when it reloads:');

  let w = world({ serverVersion: 'v9.9.9 · live' });
  await run(w);
  ck('a BEHIND client reloads itself', w.reloads === 1, 'reloads=' + w.reloads);
  ck('...after pulling the page through the cache first',
     w.fetched.some((f) => f.cache === 'reload'),
     JSON.stringify(w.fetched.map((f) => f.cache)));
  ck('...and reads version.json with no caching of its own',
     w.fetched.some((f) => /version\.json/.test(f.url) && f.cache === 'no-store'));

  w = world({ serverVersion: appVersion });
  await run(w);
  ck('a CURRENT client does not reload', w.reloads === 0, 'reloads=' + w.reloads);

  // ── 4 · THE LOOP, which is the thing that would be worse than the bug ────
  console.log('\n  it cannot loop:');

  w = world({ serverVersion: 'v9.9.9 · live' });
  await run(w);
  ck('the first check reloads once', w.reloads === 1, 'reloads=' + w.reloads);
  ck('...and remembers which version it tried',
     w.stored.tn_reloaded_for === 'v9.9.9 · live', JSON.stringify(w.stored));

  // A FRESH PAGE that is STILL stale: same memory, same server version. That
  // is the loop - the reload changed nothing - and it has to stop here.
  const again = world({ serverVersion: 'v9.9.9 · live', stored: w.stored });
  await run(again);
  ck('A RELOAD THAT CHANGED NOTHING IS NOT REPEATED',
     again.reloads === 0, 'reloads=' + again.reloads);

  // But a genuinely newer one must still be acted on.
  const newer = world({ serverVersion: 'v9.9.10 · live', stored: w.stored });
  await run(newer);
  ck('...while a genuinely newer version still reloads', newer.reloads === 1);

  // ── 5 · it never reloads over somebody's work ────────────────────────────
  console.log('\n  it never reloads over work in progress:');

  for (const [label, opts] of [
    ['a modal is open', { modalHtml: '<div class="modal">x</div>' }],
    ['the film is playing', { filmHtml: '<div class="tn-player">x</div>' }],
    ['a cursor is in a text field', { activeTag: 'INPUT' }],
    ['...or a textarea', { activeTag: 'TEXTAREA' }],
    ['...or a select', { activeTag: 'SELECT' }],
  ]) {
    const ww = world(Object.assign({ serverVersion: 'v9.9.9 · live' }, opts));
    await run(ww);
    ck(label + ' → it waits', ww.reloads === 0, 'reloads=' + ww.reloads);
  }

  // ── 6 · it is quiet when it cannot tell ──────────────────────────────────
  console.log('\n  when it cannot tell:');

  w = world({ throws: true, serverVersion: 'v9.9.9 · live' });
  await run(w);
  ck('offline: no reload, no throw', w.reloads === 0);

  w = world({ httpOk: false, serverVersion: 'v9.9.9 · live' });
  await run(w);
  ck('version.json missing: no reload', w.reloads === 0);

  w = world({ serverVersion: '' });
  await run(w);
  ck('an empty version is ignored rather than acted on', w.reloads === 0);

  // ── 7 · it is throttled ──────────────────────────────────────────────────
  console.log('\n  it is throttled:');
  w = world({ serverVersion: appVersion });
  await run(w);
  const n1 = w.fetched.length;
  await w.check();                          // immediately again, same page
  ck('a second call within the window does not re-fetch',
     w.fetched.length === n1, w.fetched.length + ' vs ' + n1);
  ck('...and the first call DID fetch, so the check above means something',
     n1 >= 1, 'fetches=' + n1);

  // ── 8 · it is wired in ───────────────────────────────────────────────────
  console.log('\n  it is actually called:');
  ck('on returning to the tab', /visibilitychange[\s\S]{0,160}?tnCheckVersion\(\)/.test(web));
  ck('and once at startup', /async function boot\(\)[\s\S]{0,200}?tnCheckVersion/.test(web));

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  if (useOld) {
    console.log(fail > 0
      ? '  CONTROL OK — the baseline has no version check.\n'
      : '  CONTROL BROKEN — these checks measure nothing.\n');
    process.exit(fail > 0 ? 0 : 1);
  }
  process.exit(fail ? 1 : 0);
})();
