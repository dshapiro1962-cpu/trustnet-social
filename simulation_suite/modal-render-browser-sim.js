// modal-render-browser-sim.js — every modal RENDERED, in a real browser.
//
// WHY THIS EXISTS. On 16 Sep the Add to Library dialog was completely broken in
// production and the suite was green. save-and-send-sim.js called
// arSendBoxHtml, arSendTargets and arUpdateSaveLabel directly and asserted 24
// things about them — all correct. It never called modalAddRec, which is the
// function that USES them, and modalAddRec threw:
//
//     ReferenceError: editId is not defined
//
// because the new section was written with a guard copied from modalAddMember,
// which does have an editId. modalAddRec takes no parameters at all. Every
// helper worked perfectly and the dialog did not open.
//
// A vm with a hand-built DOM cannot catch that: the thing it does not exercise
// is the render. So this loads the REAL page in headless Chrome, stubs only the
// network, and calls every modal builder there is. A builder that throws is a
// screen that does not open.
//
//   node modal-render-browser-sim.js         → must PASS
//   node modal-render-browser-sim.js --old   → index.pre-v0.94.1.html, must FAIL
//
// Needs Chrome. Skips cleanly without it.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const useOld = process.argv.indexOf('--old') > -1;
const page = useOld
  ? path.join(__dirname, 'index.pre-v0.94.1.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(page)) { console.error('missing fixture: ' + page); process.exit(2); }

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) { console.error('no Chrome on this machine — skipping.'); process.exit(2); }

const TMP = process.env.TEMP || process.env.TMP || '.';
const probe = [
  '(function(){',
  '  var out = [];',
  '  var names = ["fab-menu","add-rec","add-circle","add-member","invite","circle-link",',
  '               "interests","edit-rec","fix-category","chat-import","share-list",',
  '               "share-rec","collection-create","collection-send","edit-collection",',
  '               "reply","resolve-query","file-suggestion","add-reciprocal","edit-circle"];',
  '  for (var i = 0; i < names.length; i++) {',
  '    try {',
  '      var html = modalHtmlFor(names[i]);',
  '      out.push((html && html.length > 40 ? "OK   " : "EMPTY") + " " + names[i]);',
  '    } catch (e) {',
  '      out.push("THREW " + names[i] + " :: " + String(e && e.message || e).slice(0, 90));',
  '    }',
  '  }',
  '  return out.join(" ||| ");',
  '})()',
].join('\n');

// modalHtmlFor is the dispatcher inside openModal; the page does not expose it,
// so the shim below reproduces only the dispatch and calls the real builders.
const shim = `
<script>
window.__probeReady = false;
window.addEventListener('load', function () {
  try {
    // Enough state for a builder to render against. No network, no auth.
    AppState.userProfile = { id: 'u1', name: 'dan', email: 'd@x.com' };
    AppState.userCircles = [{ id: 'c1', name: 'Travel', domain: 'travel', color: '#217A4B', ownerId: 'u1', memberIds: ['m1','m2'] }];
    AppState.userMembers = [
      { id: 'm1', name: 'Tom', circleId: 'c1', ownerId: 'u1', contactMethod: 'whatsapp', contactValue: '+972500000001', linkedUserId: 'u2', isExternalSource: false },
      { id: 'm2', name: 'Tchia', circleId: 'c1', ownerId: 'u1', contactMethod: 'email', contactValue: '', linkedUserId: null, isExternalSource: false }
    ];
    AppState.userCanonicals = [{ id: 'k1', name: 'Basta', location: 'Tel Aviv', imageEmoji: '\\u{1F37D}', primaryCategory: 'dining' }];
    AppState.userRecs = [{ id: 'r1', canonicalId: 'k1', circleId: 'c1', note: 'good', rating: 5, tags: [], status: 'saved', date: '2026-09-16' }];
    AppState.userQueries = [{ id: 'q1', circleId: 'c1', text: 'best bar?', responses: [{ id: 'resp1', contactId: 'm1', recName: 'Minzar', recNote: 'nice', savedToLibrary: false }] }];
    AppState.synCircles = AppState.synCircles || [];
    AppState.synUsers = AppState.synUsers || [];

    window.modalHtmlFor = function (name) {
      var p = { circleId: 'c1', canId: 'k1', recId: 'r1', queryId: 'q1',
                respId: 'resp1', memberName: 'Tom', tmId: 'tm0', collectionId: 'col1' };
      switch (name) {
        case 'fab-menu': return modalFabMenu();
        case 'add-rec': return modalAddRec();
        case 'add-circle': return modalAddCircle(p);
        case 'edit-circle': return modalEditCircle(p);
        case 'add-member': return modalAddMember(p);
        case 'invite': return modalInvite(p);
        case 'circle-link': return modalCircleLink(p);
        case 'interests': return modalInterests(p);
        case 'edit-rec': return modalEditRec(p);
        case 'fix-category': return modalFixCategory(p);
        case 'chat-import': return modalChatImport(p);
        case 'share-list': return modalShareList(p);
        case 'share-rec': return modalShareRec(p);
        case 'collection-create': return modalCollectionCreate(p);
        case 'collection-send': return modalCollectionSend(p);
        case 'edit-collection': return modalEditCollection(p);
        case 'reply': return modalReply(p);
        case 'resolve-query': return modalResolveQuery(p);
        case 'file-suggestion': return modalFileSuggestion(p);
        case 'add-reciprocal': return modalAddReciprocal(p);
        default: return '';
      }
    };
    window.__probeReady = true;
  } catch (e) {
    window.__probeError = String(e && e.message || e);
  }
  document.title = 'P' + (window.__probeReady ? String(${JSON.stringify(probe)} ? eval(${JSON.stringify(probe)}) : '') : ('BOOT ' + window.__probeError));
});
</script>
`;

const src = fs.readFileSync(page, 'utf8');
const target = path.join(TMP, 'tn-modal-probe-' + (useOld ? 'old' : 'new') + '.html');
fs.writeFileSync(target, src.replace('</body>', shim + '</body>'), 'utf8');

let dom = '';
try {
  dom = cp.execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=390,844',
    '--virtual-time-budget=12000', '--dump-dom',
    'file:///' + target.split(path.sep).join('/'),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { dom = String(e.stdout || ''); }

const m = dom.match(/<title>P([\s\S]*?)<\/title>/);
let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

console.log('\n   fixture: ' + path.basename(page) + (useOld ? '   (must FAIL)' : '') + '\n');
console.log('== every modal builder, called in a real browser ==\n');

if (!m) {
  console.log('  FAIL  the page did not reach its load handler at all');
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': 0 passed, 1 failed\n');
  process.exit(1);
}
if (/^BOOT /.test(m[1])) {
  console.log('  FAIL  setting up the probe threw: ' + m[1].slice(5, 140));
  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': 0 passed, 1 failed\n');
  process.exit(1);
}

const rows = m[1].split(' ||| ').filter(Boolean);
ck('every modal was reached', rows.length >= 20, 'got ' + rows.length);
rows.forEach((r) => {
  // "OK   add-rec" is padded, so split on runs of whitespace, not one space.
  const name = (r.trim().split(/\s+/)[1]) || '?';
  if (/^THREW/.test(r)) ck(name + ' renders', false, r.slice(r.indexOf('::') + 3));
  else if (/^EMPTY/.test(r)) ck(name + ' renders', false, 'returned nothing');
  else ck(name + ' renders', true);
});

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
