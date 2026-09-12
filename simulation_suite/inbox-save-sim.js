// inbox-save-sim.js — saving an answer from the INBOX, where there is no
// query on screen to borrow state from.
//
// dan, 12 Sep, on a phone: opened a travel circle, asked (in Hebrew) for
// hotels and restaurants in Apulia, got two answers back, pressed
// "+ Save to Library" on the Inbox card — and nothing happened. No modal, no
// toast, no console error.
//
// THE CAUSE: both save handlers opened with `if (!AppState.queryState) return;`
// and queryState is set only by handleSendQuery, only for the life of one page.
// Answers arrive hours later, so by the time you reach the Inbox it is always
// null. The button had been dead since it was added in v0.76.0 on 25 Aug.
//
// THE TRAP IN THE OBVIOUS FIX: handleConfirmSaveToLibrary reads six things off
// queryState, not just the response — circleId, text, queryId. Faking a
// queryState for the Inbox with an empty `text` would save every Inbox item
// with NO source_question, silently discarding 0047. So the assertions below
// are about THE SAVED ROW, not about a modal appearing.
//
// This runs THE REAL responseContext, handleSaveToLibrary and
// handleConfirmSaveToLibrary in a vm. Every write is recorded and asserted on.
//
//   node inbox-save-sim.js         → must PASS
//   node inbox-save-sim.js --old   → index.pre-v0.89.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.89.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

const QTEXT = 'חבר נוסע לאיטליה לאזור Apulia מבקש המלצות למלונות ומסעדות';

const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const src = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');

const grab = (name) => {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return '';
  const head = src.lastIndexOf('async ', at) === at - 6 ? at - 6 : at;
  let d = 0, i = src.indexOf('{', at), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  return src.slice(head, end + 1);
};

// ── the world, as it is when you open the Inbox next morning ──────────────
// The defining fact: AppState.queryState is NULL. The page has been reloaded
// since the question was sent; nothing is on screen but the Inbox.
function freshWorld() {
  const recs = [], canons = [], saved = { recs: [], canons: [], queries: [] };
  const commits = [], posts = [], toasts = [];
  const modalRoot = { innerHTML: '', querySelector: () => null };
  const fields = {
    'sl-name': { value: 'Masseria Torre Coccaro' },
    'sl-cat': { value: 'hotel' },
    'sl-loc': { value: 'Apulia' },
    'sl-note': { value: 'best pool in Puglia, ask for the sea-view room' },
    'sl-stars': { dataset: { rating: '5' } },
  };

  const QUERY = {
    id: 'q1', circleId: 'c-travel', text: QTEXT, degree: 1, status: 'sent',
    sentAt: '2026-09-12T06:00:00Z',
    responses: [
      { id: 'resp-a', contactId: 'm1', recName: 'Masseria Torre Coccaro', recLoc: 'Apulia',
        recNote: 'best pool in Puglia', recCat: 'hotel', recRating: 5, recTags: ['hotel'],
        recEmoji: '🏨', isAnonymous: false, savedToLibrary: false, respondedAt: '2026-09-12T07:00:00Z' },
      { id: 'resp-b', contactId: 'm2', recName: 'Antichi Sapori', recLoc: 'Andria',
        recNote: 'the vegetable antipasti are the whole point', recCat: 'restaurant', recRating: 5,
        recTags: [], recEmoji: '🍽️', isAnonymous: false, savedToLibrary: false, respondedAt: '2026-09-12T07:30:00Z' },
      { id: 'resp-done', contactId: 'm1', recName: 'Already Kept', recLoc: 'Lecce', recNote: 'x',
        recCat: 'place', recRating: 4, recTags: [], isAnonymous: false, savedToLibrary: true,
        respondedAt: '2026-09-12T07:40:00Z' },
    ],
  };

  const ctx = {
    console, Array, String, Object, Number, Promise, JSON, Math, Date, parseInt, isNaN,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    uid: (() => { let n = 0; return () => 'new-' + (++n); })(),
    toast: (m, k) => toasts.push({ msg: String(m), kind: k || 'ok' }),
    closeModal: () => { modalRoot.innerHTML = ''; },
    renderApp: () => {},
    avatarEl: () => '<div class="avatar"></div>',
    respFindLinks: () => '',
    shareDefault: () => true,
    findExistingCanonical: () => null,
    existingRecFor: () => null,
    fnPost: async (fn, body) => { posts.push({ fn, body }); return { entity: null }; },
    librarianCommit: (canId, opts) => commits.push({ canId, opts }),
    saveCanonicals: async (id) => { saved.canons.push(id); },
    saveRecs: async (ids) => { saved.recs.push.apply(saved.recs, ids); },
    saveQueries: async (ids) => { saved.queries.push.apply(saved.queries, ids); },
    AppState: {
      queryState: null,               // ← THE WHOLE POINT
      isDemoMode: false,
      userQueries: [QUERY],
      userRecs: recs,
      userCanonicals: canons,
      userProfile: { id: 'u-dan' },
      circleById: (id) => (id === 'c-travel' ? { id: 'c-travel', name: 'travel' } : null),
      memberById: (id) => ({ m1: { id: 'm1', name: 'may shapiro' },
                             m2: { id: 'm2', name: 'Rany Shapiro' } }[id] || null),
      canonicalById: (id) => canons.find((c) => c.id === id) || null,
    },
    document: { getElementById: (id) => (id === 'modal-root' ? modalRoot : (fields[id] || null)) },
  };
  vm.createContext(ctx);
  ['responseContext', 'handleSaveToLibrary', 'handleConfirmSaveToLibrary']
    .forEach((n) => { const c = grab(n); if (c) vm.runInContext(c, ctx); });
  return { ctx, QUERY, recs, canons, saved, commits, posts, toasts, modalRoot, fields };
}

(async () => {

console.log('\n== CONTROL SECTION: the Inbox, with no query on screen ==\n');
console.log('   fixture: ' + path.basename(file) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1. the modal must open at all ─────────────────────────────────────────
{
  const w = freshWorld();
  ck('responseContext exists', typeof w.ctx.responseContext === 'function',
     'the fix IS the helper; without it the save can only borrow screen state');
  await w.ctx.handleSaveToLibrary('resp-a');
  ck('pressing + Save to Library from the INBOX opens the modal',
     /Save to Library/.test(w.modalRoot.innerHTML),
     'modal-root is empty — this is dan’s "nothing happens"');
  ck('the modal names the recommender', /may shapiro/.test(w.modalRoot.innerHTML));
  ck('the modal is prefilled with the answer', /Masseria Torre Coccaro/.test(w.modalRoot.innerHTML));
}

// ── 2. the SAVED ROW, which is what actually matters ─────────────────────
{
  const w = freshWorld();
  await w.ctx.handleConfirmSaveToLibrary('resp-a');

  ck('a row was actually written — saveRecs was called',
     w.saved.recs.length === 1, 'saveRecs ids: ' + JSON.stringify(w.saved.recs));
  const rec = w.recs[0];
  ck('the item exists in the library', !!rec, 'nothing was pushed to userRecs');
  if (rec) {
    ck('source_question carries the question (0047), NOT an empty string',
       rec.sourceQuestion === QTEXT,
       'got ' + JSON.stringify(String(rec.sourceQuestion).slice(0, 40)) + ' — a faked queryState loses this');
    ck('the Hebrew survives byte for byte, Latin place name included',
       rec.sourceQuestion === QTEXT && String(rec.sourceQuestion).indexOf('Apulia') > -1);
    ck('it is filed under the circle that was ASKED', rec.circleId === 'c-travel',
       'got ' + JSON.stringify(rec.circleId));
    ck('it links back to the query', rec.queryId === 'q1', 'got ' + JSON.stringify(rec.queryId));
    ck('it credits the member who answered', rec.recommendedBy === 'm1');
    ck('the rating came off the stars', rec.rating === 5);
  }
  ck('the canonical was written too', w.saved.canons.length === 1);
  ck('the catalogue entry was committed WITH the question',
     w.commits.length === 1 && w.commits[0].opts.queryText === QTEXT,
     'commits: ' + JSON.stringify(w.commits.map((c) => String(c.opts.queryText).slice(0, 20))));
  ck('the librarian was asked to enrich using the question',
     w.posts.some((p) => p.fn === 'librarian' && p.body.query_text === QTEXT),
     'librarian posts: ' + JSON.stringify(w.posts.map((p) => p.fn)));
  ck('the librarian was told which circle asked',
     w.posts.some((p) => p.fn === 'librarian' && p.body.circle_name === 'travel'));
  ck('the answer is marked saved so the button flips',
     w.QUERY.responses[0].savedToLibrary === true);
  ck('and that mark was PERSISTED, or the heartbeat resurrects the button',
     w.saved.queries.indexOf('resp-a') > -1);
  ck('the user was told it worked', w.toasts.some((t) => /saved to your library/i.test(t.msg)));
}

// ── 3. dan had TWO answers. Both must save. ──────────────────────────────
{
  const w = freshWorld();
  await w.ctx.handleConfirmSaveToLibrary('resp-a');
  w.fields['sl-name'].value = 'Antichi Sapori';
  w.fields['sl-cat'].value = 'restaurant';
  await w.ctx.handleConfirmSaveToLibrary('resp-b');
  ck('saving the first answer does not break the second',
     w.recs.length === 2, 'rows written: ' + w.recs.length);
  ck('both rows carry the same question',
     w.recs.length === 2 && w.recs.every((r) => r.sourceQuestion === QTEXT));
  ck('both are filed under the travel circle',
     w.recs.length === 2 && w.recs.every((r) => r.circleId === 'c-travel'));
}

// ── 4. nothing may ever be silent again ─────────────────────────────────
{
  const w = freshWorld();
  await w.ctx.handleSaveToLibrary('resp-does-not-exist');
  ck('an answer that cannot be found SAYS SO rather than doing nothing',
     w.toasts.length > 0, 'no toast and no modal is the bug, not the guard');
  ck('and it does not open an empty modal', !/Save to Library/.test(w.modalRoot.innerHTML));
}
{
  const w = freshWorld();
  await w.ctx.handleSaveToLibrary('resp-done');
  ck('an answer already kept still says "Already saved"',
     w.toasts.some((t) => /already saved/i.test(t.msg)));
  ck('and does not open the modal again', !/Save to Library/.test(w.modalRoot.innerHTML));
}
{
  const w = freshWorld();
  await w.ctx.handleConfirmSaveToLibrary('resp-does-not-exist');
  ck('confirming an answer that cannot be found writes NOTHING',
     w.recs.length === 0 && w.saved.recs.length === 0);
}

// ── 5. the query screen must not have regressed ─────────────────────────
// The surface that already worked: queryState IS set, as handleSendQuery
// leaves it. These pass on BOTH fixtures — that is the point of them.
{
  const w = freshWorld();
  w.ctx.AppState.queryState = { phase: 'sent', text: QTEXT, circleId: 'c-travel',
                                queryId: 'q1', responses: w.QUERY.responses, visibleCount: 3 };
  await w.ctx.handleSaveToLibrary('resp-b');
  ck('the query screen still opens the modal', /Save to Library/.test(w.modalRoot.innerHTML));
  await w.ctx.handleConfirmSaveToLibrary('resp-b');
  ck('the query screen still writes a complete row',
     w.recs.length === 1 && w.recs[0].sourceQuestion === QTEXT && w.recs[0].circleId === 'c-travel',
     JSON.stringify(w.recs[0] ? { q: String(w.recs[0].sourceQuestion).slice(0, 12), c: w.recs[0].circleId } : null));
}

// ── 6. the special case that existed only to fake the state is gone ─────
// Structural, and it says so: the action is wired in a click handler, which
// this sim does not execute.
{
  const live = src.replace(/\/\/[^\n]*/g, '');
  ck('save-to-library-history is gone — it faked queryState AND clobbered a real one',
     live.indexOf('save-to-library-history') < 0,
     'still present outside comments');
}

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed'
  + (useOld ? '   (control: failures are REQUIRED here)' : '') + '\n');

process.exit(fail > 0 ? 1 : 0);
})();
