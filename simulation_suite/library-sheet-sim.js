// library-sheet-sim.js — the sheet where it belongs (v0.96.0)
//
// dan, 21 Sep: "the answer sheet function is in the wrong place. A reminder it
// is meant for two purposes. 1. for the user to pull from the librery all the
// info he has on a certain topic e.g i am traveling to paris what to see
// everything connected to paris i have in my library regardless from which
// circle it came 2. someone sends me a query 'traveling to paris need
// recommendations' i want to be able to send him my paris answer sheet. at the
// moment the only place i can access it is through my questions."
//
// WHAT THIS RUNS
//   1. the REAL item normalisation from receive-response, in a vm (types
//      stripped — there is no Deno here): one answer still works, a list of
//      answers works, blanks are dropped, twenty is the cap
//   2. the REAL audience filter from send-collection, in a vm: chosen people,
//      or everyone when nobody is named
//   3. search-library's width, by source — a sheet asks for 40 and the
//      candidate pool has to grow with it
//   4. receive-response's storage loop, BY SOURCE ONLY. It is Deno plus a
//      Supabase client and neither exists on this machine; every claim in
//      section 4 is about the shape of the code, not its behaviour, and says so
//   5. THE THREE SCREENS, RENDERED AND USED in headless Chrome inside a 390px
//      iframe: the library's offer as you type, the topic sheet, the send
//      modal with Recommend's own people picker (ticked, unticked, circle
//      switched, sent), and answering someone's question out of the library
//      (ticks off, sent, the request marked answered)
//
//   node library-sheet-sim.js         -> must PASS
//   node library-sheet-sim.js --old   -> *.pre-v0.96.0.*, must FAIL
//
// Each fixture is the file as it stood before THIS change, taken from HEAD at
// the moment the change began — not a shared "original", which would already
// contain a sibling fix and let the control pass for nothing.
//
// Needs Chrome and a network (the page loads the Supabase client from a CDN
// exactly as a browser does). Without Chrome the render section cannot run, and
// this does not pass without it.

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const cp = require('child_process');

const useOld = process.argv.indexOf('--old') > -1;
const F = (name, live) => useOld ? path.join(__dirname, name) : path.join(__dirname, '..', ...live);
const PAGE = F('index.pre-v0.96.0.html', ['web', 'index.html']);
const RECV = F('receive-response.pre-v0.96.0.ts', ['supabase', 'functions', 'receive-response', 'index.ts']);
const SEND = F('send-collection.pre-v0.96.0.ts', ['supabase', 'functions', 'send-collection', 'index.ts']);
const SEARCH = F('search-library.pre-v0.96.0.ts', ['supabase', 'functions', 'search-library', 'index.ts']);
for (const f of [PAGE, RECV, SEND, SEARCH]) {
  if (!fs.existsSync(f)) { console.error('missing fixture: ' + f); process.exit(2); }
}

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 200) : '')); }
};

console.log('\n   fixtures: ' + path.basename(PAGE) + ', ' + path.basename(RECV)
  + ', ' + path.basename(SEND) + (useOld ? '   (must FAIL)' : '') + '\n');

// LINE ENDINGS. git here runs with core.autocrlf=true, so a file a patch wrote
// with LF comes back from the next checkout with CRLF, and the slices below
// stop finding what they look for. delivery-errors-sim.js crashed that way
// without a line of the product changing.
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const recvSrc = lf(RECV);
const sendSrc = lf(SEND);
const searchSrc = lf(SEARCH);

// ── 1. an answer may carry several things ──────────────────────────────────
console.log('== 1. receive-response: one answer, or a sheet of them ==\n');
let norm = null;
{
  // The REAL expression, lifted whole and run. Only the type annotation goes.
  const at = recvSrc.indexOf('const items: Item[] =');
  if (at > -1) {
    const end = recvSrc.indexOf('\n  if (!body.token', at);
    const js = recvSrc.slice(at, end).replace(': Item[]', '');
    // The cap comes from the function too — a number typed in here would test
    // this file against itself.
    const cap = (recvSrc.match(/const MAX_ITEMS = \d+;/) || [''])[0];
    const ctx = { out: null };
    vm.createContext(ctx);
    try {
      vm.runInContext(cap + '\nthis.norm = function (body) { ' + js + '\n return items; };', ctx);
      norm = ctx.norm;
    } catch (e) { /* reported by the check below */ }
  }
}
ck('the answer body is normalised to a list before anything is stored', typeof norm === 'function');
if (norm) {
  const one = norm({ token: 't', rec_name: 'Masseria Moroseta', rec_note: 'the terrace room', rec_location: 'Ostuni' });
  ck('the form respond.html has always sent still works, as a list of one',
     one.length === 1 && one[0].rec_name === 'Masseria Moroseta' && one[0].rec_note === 'the terrace room', JSON.stringify(one));
  const many = norm({ token: 't', items: [
    { rec_name: 'Masseria Moroseta', rec_note: 'a', rec_location: 'Ostuni' },
    { rec_name: 'Arte', rec_note: 'b', rec_location: 'Lecce' },
    { rec_name: 'Matera', rec_note: '', rec_location: '' },
  ] });
  ck('a sheet of three arrives as three', many.length === 3, JSON.stringify(many.map((x) => x.rec_name)));
  ck('...in the order they were ticked', many[0].rec_name === 'Masseria Moroseta' && many[2].rec_name === 'Matera');
  ck('a nameless row is dropped rather than stored blank',
     norm({ token: 't', items: [{ rec_name: '  ' }, { rec_name: 'Arte' }] }).length === 1);
  ck('an empty list falls back to the single answer',
     norm({ token: 't', items: [], rec_name: 'Arte' }).length === 1);
  ck('nothing at all is nothing — the caller then gets the error',
     norm({ token: 't' }).length === 0);
  const big = norm({ token: 't', items: Array.from({ length: 50 }, (_, i) => ({ rec_name: 'x' + i })) });
  ck('fifty things are capped at twenty, not sent as fifty writes', big.length === 20, String(big.length));
  ck('items[] wins over a stray single answer in the same body',
     norm({ token: 't', rec_name: 'Old', items: [{ rec_name: 'New' }] })[0].rec_name === 'New');
}

// ── 2. a list goes to the people you ticked ────────────────────────────────
console.log('\n== 2. send-collection: chosen people, or everyone ==\n');
let audience = null;
{
  const at = sendSrc.indexOf('const chosen =');
  if (at > -1) {
    const end = sendSrc.indexOf('for (const m of audience)', at);
    const js = sendSrc.slice(at, end).replace(/\(x: any\)/g, '(x)').replace('return err("no_chosen_members_in_circle");', 'return "no_chosen_members_in_circle";');
    const ctx = {};
    vm.createContext(ctx);
    try {
      vm.runInContext('this.aud = function (body, members) { ' + js + '\n return audience; };', ctx);
      audience = ctx.aud;
    } catch (e) { /* reported below */ }
  }
}
ck('send-collection decides an audience before it sends anything', typeof audience === 'function');
if (audience) {
  const members = [
    { id: 'm1', name: 'Tal', is_external_source: false },
    { id: 'm2', name: 'Rany', is_external_source: false },
    { id: 'm3', name: 'A chat export', is_external_source: true },
  ];
  const all = audience({}, members);
  ck('no list named means the whole circle, as every earlier caller meant',
     all.length === 2 && all.every((m) => !m.is_external_source), JSON.stringify(all.map((m) => m.id)));
  const two = audience({ member_ids: ['m2'] }, members);
  ck('one person ticked reaches one person', two.length === 1 && two[0].id === 'm2', JSON.stringify(two.map((m) => m.id)));
  ck('an external source is never messaged, ticked or not',
     audience({ member_ids: ['m3'] }, members) === 'no_chosen_members_in_circle');
  ck('names from another circle do not silently become "everyone"',
     audience({ member_ids: ['zz'] }, members) === 'no_chosen_members_in_circle');
}

// ── 3. a sheet is wider than a search ──────────────────────────────────────
console.log('\n== 3. search-library: wide enough to be a sheet ==\n');
ck('the caller can ask for up to 40', /Math\.min\(Number\(body\.limit\) \|\| 10, 40\)/.test(searchSrc));
ck('...and the candidate pool grows with what was asked for',
   /p_limit:\s*Math\.max\(30,\s*limit \* 2\)/.test(searchSrc));
ck('[guard] the pool is never smaller than it was before this change',
   !/p_limit:\s*(\d+)/.test(searchSrc) || Number((searchSrc.match(/p_limit:\s*(\d+)/) || [0, 0])[1]) >= 30);

// ── 4. the storage loop, by source only ────────────────────────────────────
// THERE IS NO DENO AND NO DATABASE HERE. Everything in this section is about
// the shape of the code. It is the weakest section in the file and is written
// so that it says so rather than reading like evidence of behaviour.
console.log('\n== 4. the storage loop (source structure only) ==\n');
ck('[structure] every item is stored, not only the first', /for \(let i = 0; i < items\.length; i\+\+\)/.test(recvSrc));
ck('[structure] the first item takes the row this token belongs to',
   /if \(i === 0\)[\s\S]{0,900}\.update\(answer\)\.eq\("response_token", body\.token\)/.test(recvSrc));
ck('[guard] a failed FIRST write still returns an error, as it has since v0.73.0',
   /return err\("response_not_saved: " \+ respErr\.message, 500\)/.test(recvSrc));
ck('[structure] later items get their own response_token, which is unique and not null',
   /response_token: crypto\.randomUUID\(\)/.test(recvSrc));
ck('[structure] a later item failing is logged and the rest are kept',
   /extra_answer_write_failed[\s\S]{0,120}continue;/.test(recvSrc));
ck('[structure] every stored item is considered for enrichment',
   /for \(const it of stored\)[\s\S]{0,700}enrichOne\(/.test(recvSrc));
ck('[structure] the asker gets ONE notification, however many things arrived',
   (recvSrc.match(/type: "query_response"/g) || []).length === 1
   && /stored\.length > 1[\s\S]{0,200}answered with \$\{stored\.length\} recommendations/.test(recvSrc));
ck('[guard] the answerer\u2019s own request is still marked answered (0046)',
   /notifications"\)[\s\S]{0,120}handled_at/.test(recvSrc));
ck('[structure] the caller is told how many were stored', /stored: stored\.length/.test(recvSrc));

// ── 5. the screens ─────────────────────────────────────────────────────────
console.log('\n== 5. the three screens, rendered and used at 390px ==\n');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  console.log('  (no Chrome here — the render section cannot run, and this does not pass without it)');
  fail++;
} else {
  const html = lf(PAGE);
  const TMP = process.env.TEMP || process.env.TMP || '.';

  // The fixture: a library with seven things about Puglia, from two circles
  // and three people — which is the whole point, "regardless from which circle
  // it came".
  const CANS = [
    ['k1', 'Masseria Moroseta', 'Ostuni, Puglia', 'travel', ['hotel', 'puglia']],
    ['k2', 'Borgo Egnazia', 'Fasano', 'travel', ['hotel']],
    ['k3', 'Arte', 'Lecce', 'dining', ['restaurant']],
    ['k4', 'Osteria del Tempo Perso', 'Ostuni', 'dining', ['restaurant']],
    ['k5', 'Trattoria Nonna Nietta', 'Ostuni', 'dining', ['restaurant']],
    ['k6', 'Matera', 'Basilicata', 'travel', ['town']],
    ['k7', 'Polignano a Mare', 'Puglia', 'travel', ['town']],
  ].map((c) => ({ id: c[0], type: 'place', name: c[1], category: '', location: c[2], description: '',
    imageEmoji: '\ud83d\udccc', primaryCategory: c[3], aiTags: c[4], imageUrl: '', phone: '', kind: '',
    hasSearchDoc: true, createdBy: 'u0' }));
  const RECS = [
    ['r1', 'k1', 'c1', 'm1', 'Book the room with the terrace.'],
    ['r2', 'k2', 'c1', 'm2', 'Pricey. Worth one night.'],
    ['r3', 'k3', 'c1', 'm1', 'Ask for the orecchiette.'],
    ['r4', 'k4', 'c2', 'm4', ''],
    ['r5', 'k5', 'c2', 'm4', 'Cash only. Go early.'],
    ['r6', 'k6', 'c1', 'm2', 'Stay in the Sassi.'],
    ['r7', 'k7', 'c2', 'm4', ''],
  ].map((r) => ({ id: r[0], canonicalId: r[1], circleId: r[2], recommendedByMember: r[3], recommendedByUser: null,
    recommendedBy: r[3], queryId: null, sourceLabel: '', category: '', sourceQuestion: '', note: r[4], rating: 0,
    tags: [], status: 'saved', isAnonymous: false, sharedToNetwork: true, degree: 1, date: '2026-09-01',
    createdAt: '2026-09-01T10:00:00Z' }));
  const CIRCLES = [
    { id: 'c1', ownerId: 'u0', name: 'Travel', domain: 'travel', color: '#1D5A45', description: '', location: '', isOwn: true, memberIds: ['m1', 'm2', 'm5'] },
    { id: 'c2', ownerId: 'u0', name: 'Food', domain: 'dining', color: '#B0643E', description: '', location: '', isOwn: true, memberIds: ['m4'] },
  ];
  const MEMBERS = [
    { id: 'm1', circleId: 'c1', name: 'Tal Levi', avatar: 'T', avatarColor: '#B0643E', contactMethod: 'whatsapp', contactValue: '+972500000001', isExternalSource: false, linkedUserId: null },
    { id: 'm2', circleId: 'c1', name: 'Rany Cohen', avatar: 'R', avatarColor: '#5E7D8C', contactMethod: 'email', contactValue: 'rany@example.com', isExternalSource: false, linkedUserId: 'u9' },
    { id: 'm5', circleId: 'c1', name: 'Yossi No-Contact', avatar: 'Y', avatarColor: '#7A9086', contactMethod: '', contactValue: '', isExternalSource: false, linkedUserId: null },
    { id: 'm4', circleId: 'c2', name: 'May Bar', avatar: 'M', avatarColor: '#2A7258', contactMethod: 'whatsapp', contactValue: '+972500000004', isExternalSource: false, linkedUserId: null },
  ];
  const QUESTION = 'Traveling to Puglia in June \u2014 where to stay and eat?';

  // THE PROBE. It never reads document.body: its own source is in there, and a
  // probe that finds its own words is the guard that passes for the wrong
  // reason (25 Aug, four of them). Everything below is scoped to #view-body or
  // #modal-root.
  const probe = `
<script>
showLoginScreen = function () {};
window.addEventListener('load', function () {
  var out = { steps: [] };
  var VB = function () { return document.getElementById('view-body'); };
  var MR = function () { return document.getElementById('modal-root'); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var click = function (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
  var posts = [];
  var SEARCH_IDS = ['r1','r2','r3','r4','r5','r6','r7'];
  var searchResult = function () { return { engine: 'x', reranked: true, ids: SEARCH_IDS,
    items: SEARCH_IDS.map(function (id) { return { rec_id: id, why: 'meaning' }; }) }; };
  (async function () {
    try {
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      AppState.userProfile = { id: 'u0', name: 'Dan', avatar: 'D', avatarColor: '#1D5A45' };
      AppState._feedFetched = true; AppState._notifFetched = true;
      AppState.userCircles = ${JSON.stringify(CIRCLES)};
      AppState.userMembers = ${JSON.stringify(MEMBERS)};
      AppState.userCanonicals = ${JSON.stringify(CANS)};
      AppState.userRecs = ${JSON.stringify(RECS)};
      AppState.userCollections = [];
      fnPost = function (name, body) {
        posts.push({ name: name, body: body });
        if (name === 'search-library') return Promise.resolve(searchResult());
        if (name === 'receive-response') return Promise.resolve({ success: true, stored: (body.items || []).length });
        if (name === 'send-collection') return Promise.resolve({ ok: true, deliveries: [
          { member_id: 'm1', member: 'Tal Levi', channel: 'whatsapp', status: 'manual' },
          { member_id: 'm2', member: 'Rany Cohen', channel: 'app', status: 'sent' }] });
        return Promise.resolve({});
      };

      // ── the library offers a sheet for what you typed ──────────────────
      AppState.currentView = 'library'; AppState.searchQuery = ''; renderApp();
      out.ctaCold = !!VB().querySelector('.tn-makesheet');
      AppState.searchQuery = 'Pu'; libUpdateResultsInPlace();
      out.ctaShort = !!VB().querySelector('.tn-makesheet');
      AppState.searchQuery = 'Puglia'; libUpdateResultsInPlace();
      var cta = VB().querySelector('.tn-makesheet');
      out.ctaText = cta ? cta.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.ctaTopic = cta ? cta.dataset.topic : '';

      // ── the topic sheet ────────────────────────────────────────────────
      click(cta);
      await wait(40);
      out.view1 = AppState.currentView;
      out.searchLimit = (posts[0] && posts[0].body) ? posts[0].body.limit : null;
      out.searchQ = (posts[0] && posts[0].body) ? posts[0].body.query : '';
      var vb = VB();
      out.rows = vb.querySelectorAll('.tn-sheet-it').length;
      out.groups = [].map.call(vb.querySelectorAll('.tn-sl'), function (g) { return g.textContent.replace(/\\s+/g, ' ').trim(); });
      out.head = (vb.querySelector('.tn-eb') || {}).textContent || '';
      out.q = (vb.querySelector('.tn-sheet-q') || {}).textContent || '';
      var first = vb.querySelector('.tn-sheet-it');
      out.firstRow = first ? first.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.firstLinks = first ? [].map.call(first.querySelectorAll('a'), function (a) { return a.textContent.trim(); }) : [];
      out.circlesNamed = /Travel/.test(vb.textContent) && /Food/.test(vb.textContent);
      out.overflow = document.documentElement.scrollWidth;
      var send = vb.querySelector('[data-modal=sheet-send]');
      var savel = vb.querySelector('[data-action=sheet-save-list]');
      out.sendBtn = send ? send.textContent.trim() : '';
      out.saveBtn = savel ? savel.textContent.trim() : '';
      var r = send.getBoundingClientRect();
      out.sendVisible = r.top >= 0 && r.bottom <= window.innerHeight && r.width > 60;

      // ── the send modal: Recommend's own people picker ──────────────────
      click(send);
      await wait(20);
      var mr = MR();
      out.modalOpened = !!mr.querySelector('#ss-send');
      out.chips = [].map.call(mr.querySelectorAll('.ss-circle'), function (b) { return b.textContent.replace(/\\s+/g, ' ').trim(); });
      out.chipActive = (mr.querySelector('.ss-circle.active') || {}).dataset ? mr.querySelector('.ss-circle.active').dataset.circleId : '';
      out.ticks = mr.querySelectorAll('#q-who .qw-cb').length;
      out.ticksOn = mr.querySelectorAll('#q-who .qw-cb:checked').length;
      out.ticksOff = mr.querySelectorAll('#q-who .qw-cb[disabled]').length;
      out.sendLabel0 = mr.querySelector('#ss-send').textContent.trim();
      var boxes = mr.querySelectorAll('#q-who .qw-cb:checked');
      click(boxes[0]);
      await wait(10);
      out.sendLabel1 = mr.querySelector('#ss-send').textContent.trim();
      out.ticksOnAfter = mr.querySelectorAll('#q-who .qw-cb:checked').length;
      click(mr.querySelector('[data-action=q-who-all]'));
      await wait(10);
      out.sendLabelAll = mr.querySelector('#ss-send').textContent.trim();
      var other = [].filter.call(mr.querySelectorAll('.ss-circle'), function (b) { return b.dataset.circleId === 'c2'; })[0];
      click(other);
      await wait(10);
      out.ticksAfterSwitch = mr.querySelectorAll('#q-who .qw-cb').length;
      out.labelAfterSwitch = mr.querySelector('#ss-send').textContent.trim();
      out.circleHidden = (mr.querySelector('#ss-circle') || {}).value;
      click([].filter.call(mr.querySelectorAll('.ss-circle'), function (b) { return b.dataset.circleId === 'c1'; })[0]);
      await wait(10);
      // Send it. The list write is the one thing that cannot run in a page
      // fixture (sb is a const), so that call alone is replaced; everything
      // around it - who was ticked, what is posted, what is drawn - is real.
      sheetToCollection = function (topic) { return Promise.resolve({ token: 'tok123', id: 'col1', count: 7 }); };
      click(mr.querySelector('#ss-send'));
      await wait(40);
      var sent = posts.filter(function (p) { return p.name === 'send-collection'; })[0];
      out.sentBody = sent ? { token: sent.body.token, circle_id: sent.body.circle_id, ids: sent.body.member_ids,
        url: /tok123/.test(sent.body.share_url || '') } : null;
      var res = mr.querySelector('#ss-result');
      out.deliveryText = res ? res.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.waLink = res ? !!res.querySelector('a[href*="wa.me/"]') : false;
      closeModal();

      // ── answering someone, out of the same library ─────────────────────
      AppState._notifications = [{ id: 'n1', type: 'query', title: 'Tom Adler asked you', body: ${JSON.stringify(QUESTION)},
        response_token: 'tok-abc', created_at: new Date(Date.now() - 3600000).toISOString(), actor_name: 'Tom Adler',
        handled_at: null, link_url: '', circle_id: null }];
      showView('home');
      await wait(20);
      var homeBtn = VB().querySelector('[data-action=answer-lib]');
      out.homeDoor = homeBtn ? homeBtn.textContent.replace(/\\s+/g, ' ').trim() : '';
      showView('inbox');
      await wait(20);
      var inboxBtn = VB().querySelector('[data-action=answer-lib]');
      out.inboxDoor = inboxBtn ? inboxBtn.textContent.replace(/\\s+/g, ' ').trim() : '';
      out.inboxQ = inboxBtn ? inboxBtn.dataset.question : '';
      click(inboxBtn);
      await wait(40);
      out.view2 = AppState.currentView;
      var ab = VB();
      out.askedHead = (ab.querySelector('.tn-eb') || {}).textContent || '';
      out.askedQ = (ab.querySelector('.tn-sheet-q') || {}).textContent || '';
      out.picks = ab.querySelectorAll('.tn-sheet-pick').length;
      out.picksOn = ab.querySelectorAll('.tn-tick:not(.off)').length;
      out.alLabel0 = (ab.querySelector('#al-send') || {}).textContent || '';
      var sr = ab.querySelector('#al-send').getBoundingClientRect();
      out.alVisible = sr.bottom <= window.innerHeight + 1 && sr.width > 60;
      out.alOverflow = document.documentElement.scrollWidth;
      out.alLinks = ab.querySelectorAll('.tn-sheet-pick a').length;
      click(ab.querySelectorAll('.tn-sheet-pick')[1]);
      await wait(20);
      out.picksOn2 = VB().querySelectorAll('.tn-tick:not(.off)').length;
      out.alLabel1 = (VB().querySelector('#al-send') || {}).textContent || '';
      click(VB().querySelector('#al-send'));
      await wait(60);
      var ans = posts.filter(function (p) { return p.name === 'receive-response'; })[0];
      out.answerBody = ans ? { token: ans.body.token, n: (ans.body.items || []).length,
        first: (ans.body.items || [])[0], names: (ans.body.items || []).map(function (i) { return i.rec_name; }) } : null;
      out.view3 = AppState.currentView;
      out.handled = !!(AppState._notifications[0] || {}).handled_at;
      out.inboxDoorAfter = VB().querySelectorAll('[data-action=answer-lib]').length;
      out.inboxAnswered = /Answered/.test(VB().textContent);

      // ── one person, several things, is one person ──────────────────────
      var shell = sheetShellHtml({ id: 'q1', circleId: 'c1', text: 'X?', sentAt: new Date().toISOString(),
        responses: [
          { id: 'x1', contactId: 'm1', isAnonymous: false, recName: 'Masseria Moroseta' },
          { id: 'x2', contactId: 'm1', isAnonymous: false, recName: 'Arte' },
          { id: 'x3', contactId: 'm1', isAnonymous: false, recName: 'Matera' },
          { id: 'x4', contactId: 'm2', isAnonymous: false, recName: 'Borgo Egnazia' }] }, '');
      var probeEl = document.createElement('div');
      probeEl.innerHTML = shell;
      out.byline = (probeEl.querySelector('.tn-byline') || {}).textContent || '';

      // ── nothing in the library about it ────────────────────────────────
      SEARCH_IDS = [];
      AppState._topicSheet = null;
      showView('answer-lib', { token: 'tok-abc', question: 'Anything about Tromso?', who: 'Tom Adler', when: new Date().toISOString() });
      await wait(60);
      out.emptyText = VB().textContent.replace(/\\s+/g, ' ').trim().slice(0, 200);
      out.emptyFallback = !!VB().querySelector('a[href*="respond.html"]');
    } catch (e) {
      out.threw = String((e && e.message) || e) + ' @ ' + String((e && e.stack || '').split('\\n')[1] || '').trim();
    }
    try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e) {}
  })();
});
</` + `script>`;

  const inner = path.join(TMP, 'tn-sheet-inner.html');
  fs.writeFileSync(inner, html.replace('</body>', probe + '</body>'), 'utf8');
  const outer = path.join(TMP, 'tn-sheet-outer.html');
  // HEADLESS CHROME ON WINDOWS WILL NOT OPEN A WINDOW NARROWER THAN ~512px:
  // --window-size=390 lays out at 512 and crops, so the phone is an iframe.
  fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
    + '<iframe src="' + path.basename(inner) + '" style="width:390px;height:844px;border:0"></iframe>'
    + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
  let dom = '';
  try {
    dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,844',
      '--virtual-time-budget=12000', '--dump-dom', 'file:///' + outer.split(path.sep).join('/')],
      { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = String(e.stdout || ''); }
  const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
  const r = m ? JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
    : { threw: 'the page never reported back' };

  console.log('  -- the library offers it --');
  ck('the app runs and the probe finishes', !r.threw, r.threw);
  ck('an empty search box offers nothing', r.ctaCold === false);
  ck('two letters is not a topic', r.ctaShort === false);
  ck('typing a topic offers a sheet for it, without a re-render',
     /Make a sheet for \u201cPuglia\u201d/.test(r.ctaText || ''), r.ctaText);
  ck('...and says what it will contain', /from every circle/.test(r.ctaText || ''), r.ctaText);
  ck('...carrying the topic itself', r.ctaTopic === 'Puglia', r.ctaTopic);

  console.log('  -- the topic sheet --');
  ck('it opens its own screen', r.view1 === 'topic-sheet', r.view1);
  ck('it asks the library for a sheet-sized answer, not a search-sized one', r.searchLimit === 40, String(r.searchLimit));
  ck('...about what was typed', r.searchQ === 'Puglia', r.searchQ);
  ck('every one of the seven things is on it', r.rows === 7, String(r.rows));
  ck('grouped by what they are', (r.groups || []).some((g) => /Travel 4/.test(g)) && (r.groups || []).some((g) => /Dining 3/.test(g)), JSON.stringify(r.groups));
  ck('the head counts the items and the circles they came from',
     /7 items/.test(r.head || '') && /2 circles/.test(r.head || ''), r.head);
  ck('the topic is the headline', (r.q || '').trim() === 'Puglia', r.q);
  ck('a row says what it is, where, and who gave it to you',
     /Masseria Moroseta/.test(r.firstRow || '') && /Ostuni/.test(r.firstRow || '') && /from Tal/.test(r.firstRow || ''), r.firstRow);
  ck('...in their own words', /Book the room with the terrace/.test(r.firstRow || ''), r.firstRow);
  ck('...and the ways to go and look at it', (r.firstLinks || []).length >= 1, JSON.stringify(r.firstLinks));
  ck('BOTH circles are on one sheet \u2014 "regardless from which circle it came"', r.circlesNamed === true);
  ck('nothing runs off a 390px phone', r.overflow <= 390, String(r.overflow));
  ck('the two things you can do with it are there',
     /Send this sheet/.test(r.sendBtn || '') && /Save as a list/.test(r.saveBtn || ''), r.sendBtn + ' / ' + r.saveBtn);
  ck('...and reachable without scrolling to them (dan, 19 Sep)', r.sendVisible === true);

  console.log('  -- sending it, with Recommend\u2019s picker --');
  ck('Send this sheet opens the picker', r.modalOpened === true);
  ck('every circle is a chip', (r.chips || []).length === 2 && /Travel/.test((r.chips || [])[0] || ''), JSON.stringify(r.chips));
  ck('one of them is chosen to begin with', r.chipActive === 'c1', r.chipActive);
  ck('the circle\u2019s people are listed, ticked, exactly as Recommend lists them', r.ticks === 3 && r.ticksOn === 2, r.ticks + '/' + r.ticksOn);
  ck('...and someone with no number or email cannot be ticked', r.ticksOff === 1, String(r.ticksOff));
  ck('the button says how many it will reach', r.sendLabel0 === 'Send to 2 people', r.sendLabel0);
  ck('unticking someone drops them', r.ticksOnAfter === 1, String(r.ticksOnAfter));
  ck('...and the button says so', r.sendLabel1 === 'Send to 1 person', r.sendLabel1);
  ck('Select all puts everyone who can be reached back', r.sendLabelAll === 'Send to 2 people', r.sendLabelAll);
  ck('another circle is another set of people', r.ticksAfterSwitch === 1, String(r.ticksAfterSwitch));
  ck('...and the count follows', r.labelAfterSwitch === 'Send to 1 person', r.labelAfterSwitch);
  ck('...and the circle that will actually be sent to follows too', r.circleHidden === 'c2', r.circleHidden);
  ck('sending posts the list, to the circle', !!r.sentBody && r.sentBody.circle_id === 'c1' && r.sentBody.token === 'tok123', JSON.stringify(r.sentBody));
  ck('...to the people who were ticked, by id', !!r.sentBody && Array.isArray(r.sentBody.ids) && r.sentBody.ids.length === 2, JSON.stringify(r.sentBody && r.sentBody.ids));
  ck('...with the link to the sheet itself', !!r.sentBody && r.sentBody.url === true);
  ck('delivery is reported per person', /Tal Levi/.test(r.deliveryText || '') && /Sent/.test(r.deliveryText || ''), r.deliveryText);
  ck('...and WhatsApp is still a one-tap hand-off from your own WhatsApp', r.waLink === true);

  console.log('  -- answering someone out of your library --');
  ck('the waiting question on Home offers it', /Answer from my library/.test(r.homeDoor || ''), r.homeDoor);
  ck('the Inbox row offers it too', /From my library/.test(r.inboxDoor || ''), r.inboxDoor);
  ck('...carrying their actual question', r.inboxQ === QUESTION, r.inboxQ);
  ck('it opens its own screen', r.view2 === 'answer-lib', r.view2);
  ck('the screen says who asked', /Tom Adler asked/.test(r.askedHead || ''), r.askedHead);
  ck('...and what they asked', (r.askedQ || '').indexOf('Puglia') > -1, r.askedQ);
  ck('everything that matches is offered, ticked', r.picks === 7 && r.picksOn === 7, r.picks + '/' + r.picksOn);
  ck('the button says what will be sent, and to whom', r.alLabel0 === 'Send 7 to Tom', r.alLabel0);
  ck('...and is visible without scrolling to it', r.alVisible === true);
  ck('nothing runs off a 390px phone here either', r.alOverflow <= 390, String(r.alOverflow));
  ck('a row you are choosing carries no links to wander off to', r.alLinks === 0, String(r.alLinks));
  ck('unticking one drops it', r.picksOn2 === 6, String(r.picksOn2));
  ck('...and the button says six', r.alLabel1 === 'Send 6 to Tom', r.alLabel1);
  ck('sending posts the six, through their token', !!r.answerBody && r.answerBody.token === 'tok-abc' && r.answerBody.n === 6, JSON.stringify(r.answerBody && { t: r.answerBody.token, n: r.answerBody.n }));
  ck('...each with its name, note and place, the way an answer has always looked',
     !!r.answerBody && r.answerBody.first && r.answerBody.first.rec_name === 'Masseria Moroseta'
     && /terrace/.test(r.answerBody.first.rec_note || '') && r.answerBody.first.rec_location === 'Ostuni, Puglia',
     JSON.stringify(r.answerBody && r.answerBody.first));
  ck('...and the unticked one is not among them',
     !!r.answerBody && r.answerBody.names.indexOf('Borgo Egnazia') === -1, JSON.stringify(r.answerBody && r.answerBody.names));
  ck('afterwards you are back in the Inbox', r.view3 === 'inbox', r.view3);
  ck('...and the request no longer asks to be answered', r.handled === true && r.inboxDoorAfter === 0, String(r.inboxDoorAfter));
  ck('...it says it was answered', r.inboxAnswered === true);

  console.log('  -- counting people, not rows --');
  ck('four answers from two people is two of the circle', /2 of 3 answered/.test(r.byline || ''), r.byline);
  ck('...not four of three, which is what counting rows says',
     /answered/.test(r.byline || '') && !/4 of 3/.test(r.byline || ''), r.byline);
  ck('...and the four things they sent are still counted as four', /4 recommendations/.test(r.byline || ''), r.byline);

  console.log('  -- when the library has nothing --');
  ck('it says so plainly', /Nothing in your library matches what Tom asked/.test(r.emptyText || ''), r.emptyText);
  ck('...and is never a dead end: their question can still be answered in your own words', r.emptyFallback === true);
}

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
