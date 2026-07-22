// respond-sim.js — answer-from-library on respond.html (r2.0-lib)
const vm = require('vm'); const fs = require('fs');
const src = fs.readFileSync('/home/claude/respond/respond_script.js', 'utf8');
let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x || ''); } };
const tick = () => new Promise(r => setTimeout(r, 5));

function makeCtx(opts) {
  const el = () => ({
    _cls: {}, value: '', textContent: '', innerHTML: '', disabled: false, dataset: {},
    style: {}, _handlers: {},
    classList: {
      add(c) { this._p._cls[c] = true; }, remove(c) { delete this._p._cls[c]; },
      contains(c) { return !!this._p._cls[c]; }
    },
    addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    focus() {}
  });
  const byId = {};
  ['loading','form-view','thanks-view','error-view','ask-from','ask-text','rec-name','rec-location','rec-note',
   'submit-btn','thanks-title','thanks-body','convert-badge','convert-headline','convert-body','convert-btn',
   'error-title','error-body','lib-strip','lib-search','lib-results','lib-filled','lib-debug'].forEach(id => {
    const e = el(); e.classList._p = e; byId[id] = e;
  });
  byId['form-view']._cls.hidden = true; byId['thanks-view']._cls.hidden = true;
  byId['error-view']._cls.hidden = true; byId['lib-strip']._cls.hidden = true;

  const store = opts.localStorageData || {};
  const keys = Object.keys(store);
  const docHandlers = {};
  const ctx = {
    console, setTimeout, clearTimeout,
    window: {},
    location: { search: '?t=tok123', origin: 'https://trustnetsocial.netlify.app' },
    URLSearchParams,
    atob: (b) => Buffer.from(b, 'base64').toString('binary'),
    alert(m) { ctx.__alerts.push(m); },
    localStorage: {
      get length() { return keys.length; },
      key: (i) => keys[i] || null,
      getItem: (k) => (k in store ? store[k] : null),
      setItem() {}, removeItem() {}
    },
    document: {
      getElementById: (id) => byId[id] || null,
      addEventListener(ev, fn) { (docHandlers[ev] = docHandlers[ev] || []).push(fn); }
    },
    fetch: async (url, init2) => {
      ctx.__fetches.push({ url, init: init2 || {} });
      if (url.indexOf('response-meta') >= 0) {
        return { ok: true, status: 200, json: async () => (opts.meta || { requester_name: 'Dan', circle_name: 'Dining', query_text: 'best skin doctor?' }) };
      }
      if (url.indexOf('/rest/v1/recommendations') >= 0) {
        return { ok: true, status: 200, json: async () => (opts.libRows || []) };
      }
      if (url.indexOf('receive-response') >= 0) {
        ctx.__submitBody = JSON.parse(init2.body);
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false, status: 400, text: async () => 'stub', json: async () => ({}) };
    },
    __fetches: [], __alerts: [], __byId: byId, __docHandlers: docHandlers
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
const clickLibRow = (ctx, i) => {
  const row = { dataset: { libI: String(i) }, closest: (s) => s === '.lib-row' ? row : null };
  (ctx.__docHandlers.click || []).forEach(fn => fn({ target: row }));
};
const clickSubmit = async (ctx) => {
  const hs = ctx.__byId['submit-btn']._handlers.click || [];
  for (const fn of hs) await fn();
};

(async () => {
  // JWT with sub=uid-77 for token-only uid fallback coverage
  const payload = Buffer.from(JSON.stringify({ sub: 'uid-77' })).toString('base64').replace(/=+$/, '');
  const jwt = 'aaa.' + payload + '.bbb';
  const LIBROWS = [
    { id: 'r1', note: 'מאבחנת מעולה, שווה את ההמתנה', rating: 5, canonicals: { name: 'ד"ר ליאורה פלדמן', location: 'תל אביב', primary_category: 'healthcare' } },
    { id: 'r2', note: 'Best shakshouka in TA', rating: 5, canonicals: { name: 'Opa Restaurant', location: 'Tel Aviv', primary_category: 'dining' } },
    { id: 'r3', note: '', rating: null, canonicals: null }
  ];

  // ── Scenario 1: anonymous answerer — nothing changes ──
  let c = makeCtx({ localStorageData: {} });
  vm.runInContext(src, c, { filename: 'respond.js' }); await tick(); await tick();
  ck('version marker r2.1-lib present', fs.readFileSync('/home/claude/respond/respond.html','utf8').indexOf('>r2.1-lib</div>') >= 0);
  ck('anon: form shown, strip stays hidden', !c.__byId['form-view']._cls.hidden && c.__byId['lib-strip']._cls.hidden);
  ck('anon: no REST call made', !c.__fetches.some(f => f.url.indexOf('/rest/v1/') >= 0));
  ck('no debug param: panel stays hidden', c.__byId['lib-debug'].textContent === '');
  await clickSubmit(c); // empty name → focus, no post
  c.__byId['rec-name'].value = 'Dr. Cohen'; await clickSubmit(c); await tick();
  ck('anon regression: plain submit works', c.__submitBody && c.__submitBody.rec_name === 'Dr. Cohen' && c.__submitBody.token === 'tok123' && !c.__byId['thanks-view']._cls.hidden);

  // ── Scenario 2: session — strip, fetch, filter, prefill, edited submit ──
  c = makeCtx({
    localStorageData: { 'sb-kgsdtfrcyjrxeyqqxoic-auth-token': JSON.stringify({ access_token: jwt }) },
    libRows: LIBROWS
  });
  c.location.search = '?t=tok123&debug=1';
  vm.runInContext(src, c, { filename: 'respond.js' }); await tick(); await tick();
  const rest = c.__fetches.find(f => f.url.indexOf('/rest/v1/recommendations') >= 0);
  ck('session: REST fetch with uid from JWT + both auth headers', rest
    && rest.url.indexOf('owner_id=eq.uid-77') >= 0
    && rest.init.headers.apikey === 'sb_publishable_8MAMd56FzHTyNZtnO2XK4A_cp2lFGEm'
    && rest.init.headers.Authorization === 'Bearer ' + jwt);
  ck('session: strip revealed, 2 valid rows rendered (null canonical dropped)',
    !c.__byId['lib-strip']._cls.hidden && (c.__byId['lib-results'].innerHTML.match(/lib-row/g) || []).length === 2);
  c.__byId['lib-search'].value = 'עור'; // matches nothing → empty-state line
  (c.__byId['lib-search']._handlers.input || []).forEach(fn => fn());
  ck('search: no-match message shown', c.__byId['lib-results'].innerHTML.indexOf('Nothing matching') >= 0);
  c.__byId['lib-search'].value = 'ליאורה';
  (c.__byId['lib-search']._handlers.input || []).forEach(fn => fn());
  ck('search: Hebrew query filters to 1 row', (c.__byId['lib-results'].innerHTML.match(/lib-row/g) || []).length === 1);
  clickLibRow(c, 0);
  ck('tap: form prefilled from library item', c.__byId['rec-name'].value === 'ד"ר ליאורה פלדמן'
    && c.__byId['rec-location'].value === 'תל אביב'
    && c.__byId['rec-note'].value === 'מאבחנת מעולה, שווה את ההמתנה'
    && c.__byId['lib-filled'].style.display === 'block'
    && c.__byId['lib-results'].innerHTML === '');
  c.__byId['rec-note'].value = 'מאבחנת מעולה — תגידי שדן שלח אותך';
  await clickSubmit(c); await tick();
  ck('submit: edited prefill posted through normal flow', c.__submitBody
    && c.__submitBody.rec_name === 'ד"ר ליאורה פלדמן'
    && c.__submitBody.rec_note === 'מאבחנת מעולה — תגידי שדן שלח אותך'
    && !c.__byId['thanks-view']._cls.hidden);
  ck('thanks: convert button flips for signed-in member', c.__byId['convert-btn'].textContent === 'Open your Trustnet →');
  const dbgTxt = c.__byId['lib-debug'].textContent;
  ck('debug=1: full trace printed', dbgTxt.indexOf('uid=uid-77') >= 0 && dbgTxt.indexOf('REST status: 200') >= 0 && dbgTxt.indexOf('rows returned: 3') >= 0 && dbgTxt.indexOf('strip: SHOWN') >= 0 && c.__byId['lib-debug'].style.display === 'block');

  // ── Scenario 3: used token — error path untouched by the new code ──
  c = makeCtx({
    localStorageData: { 'sb-x-auth-token': JSON.stringify({ access_token: jwt, user: { id: 'uid-77' } }) },
    libRows: LIBROWS, meta: { used: true }
  });
  vm.runInContext(src, c, { filename: 'respond.js' }); await tick(); await tick();
  ck('used token: error view shown, no REST call, strip hidden', !c.__byId['error-view']._cls.hidden
    && c.__byId['error-title'].textContent.indexOf('already used') >= 0
    && !c.__fetches.some(f => f.url.indexOf('/rest/v1/') >= 0)
    && c.__byId['lib-strip']._cls.hidden);

  console.log('\nRESULT:', pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
