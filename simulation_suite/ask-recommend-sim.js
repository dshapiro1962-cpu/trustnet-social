// ask-recommend-sim.js — one screen, two verbs, one list of people.
//
// dan's spec, 10 Sep:
//   1. Recommend — pick an item from your library and send it BY DEFAULT to all
//      your circle members, or choose particular members.
//   2. Ask — by default to all members of the circle, plus the option to extend
//      to degree 2 as today, and the option to choose which members.
//
// FOUND WHILE BUILDING IT: "as today" was not true. The degree toggle set a
// variable inside initQueryView's closure and updated the routing preview, but
// handleSendQuery sent `degree: 1` hard-coded and never read it. Degree 2 has
// never reached anyone beyond the circle. Fixed here by putting the value on
// AppState, where the send can see it.
//
// This runs THE REAL qWhoHtml, qChosen, qUpdateSendLabel, qApplyDegreeToWho,
// qItemResultsHtml and handleSendRecFromCircle in a vm, against a DOM built
// from the markup the real render produced. Every RPC is recorded.
//
//   node ask-recommend-sim.js         → must PASS
//   node ask-recommend-sim.js --old   → index.pre-v0.88.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.88.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

(async () => {
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

const MEMBERS = [
  { id: 'm1', name: 'may shapiro', circleId: 'c1', isExternalSource: false, linkedUserId: 'u1', contactMethod: 'whatsapp', contactValue: '+972528640029' },
  { id: 'm2', name: 'Rany Shapiro', circleId: 'c1', isExternalSource: false, linkedUserId: 'u2', contactMethod: 'email', contactValue: 'r@x.com' },
  { id: 'm3', name: 'Tchia', circleId: 'c1', isExternalSource: false, linkedUserId: null, contactMethod: 'whatsapp', contactValue: '+972500000003' },
  { id: 'm4', name: 'No Contact', circleId: 'c1', isExternalSource: false, linkedUserId: null, contactMethod: 'email', contactValue: '' },
  { id: 'm9', name: 'A Critic', circleId: 'c1', isExternalSource: true, linkedUserId: null, contactMethod: 'email', contactValue: 'c@x.com' },
  { id: 'm5', name: 'Someone Else', circleId: 'c2', isExternalSource: false, linkedUserId: 'u5', contactMethod: 'email', contactValue: 's@x.com' },
];

const rpcCalls = [];
const ctx = {
  console, encodeURIComponent,
  Array, String, Object, Promise, JSON, Math, Date,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  avatarEl: () => '<div class="avatar"></div>',
  recShareText: () => 'Xing Wong BBQ — try it',
  toast: () => {},
  loadUserData: async () => {},
  AppState: {
    queryMode: 'ask', queryDegree: 1, queryCircleId: null, queryItemId: null,
    isDemoMode: false,
    userRecs: [{ id: 'r1', canonicalId: 'k1' }, { id: 'r2', canonicalId: 'k2' }],
    userMembers: MEMBERS,
    membersOfCircle: (cid) => MEMBERS.filter((m) => m.circleId === cid),
    canonicalById: (id) => ({ k1: { id: 'k1', name: 'Xing Wong BBQ', location: 'Ramat Gan', imageEmoji: '🍜' },
                              k2: { id: 'k2', name: 'Gal the Exterminator', location: '', imageEmoji: '🔨' } }[id]),
  },
  sb: { rpc: async (fn, args) => { rpcCalls.push({ fn, args });
        return args.p_member_id === 'm2' ? { data: { ok: false, error: 'already_sent' } } : { data: { ok: true } }; } },
};
vm.createContext(ctx);
['qWhoHtml', 'qChosen', 'qApplyDegreeToWho', 'qUpdateSendLabel', 'qWhoRefresh',
 'qItemResultsHtml', 'qShowPickedItem', 'sendRecToMany', 'sendResultHtml',
 'handleSendRecFromCircle'].forEach((n) => { const c = grab(n); if (c) vm.runInContext(c, ctx); });

console.log('\n-- everyone in the circle, ticked by default --\n');

const whoHtml = typeof ctx.qWhoHtml === 'function' ? ctx.qWhoHtml('c1') : '';
ck('the WHO list exists', !!whoHtml, 'qWhoHtml is missing');

const tags = [...whoHtml.matchAll(/<input type="checkbox" class="qw-cb"[^>]*>/g)].map((m) => m[0]);
ck('one row per member of THAT circle', tags.length === 4,
   'found ' + tags.length + ' — external sources are not messageable and must not appear');
ck('everyone reachable starts TICKED — the default is the whole circle',
   tags.filter((t) => / checked/.test(t)).length === 3,
   'dan: "by default to all your circle members"');
ck('someone with no way to be reached cannot be ticked',
   tags.filter((t) => / disabled/.test(t)).length === 1);
ck('each row carries its channel', /data-channel="app"/.test(whoHtml) && /data-channel="whatsapp"/.test(whoHtml));

// ── a DOM over that markup ────────────────────────────────────────────────
const boxes = tags.map((t) => ({
  dataset: { memberId: (t.match(/data-member-id="([^"]+)"/) || [])[1],
             channel: (t.match(/data-channel="([^"]+)"/) || [])[1] },
  disabled: / disabled/.test(t), checked: / checked/.test(t),
}));
const el = (id) => ({ id, style: {}, innerHTML: '', textContent: '', disabled: false, value: '' });
const sendBtn = el('q-send'); const whoBox = el('q-who'); const note = el('q-who-note');
const result = el('q-result'); const picked = el('q-item-picked');
ctx.document = {
  querySelectorAll: (sel) => (sel === '.qw-cb' ? boxes : sel === '.qw-cb:checked' ? boxes.filter((b) => b.checked) : []),
  getElementById: (id) => ({ 'q-send': sendBtn, 'q-who': whoBox, 'q-who-note': note,
                             'q-result': result, 'q-item-picked': picked }[id] || null),
};

console.log('\n-- the button says who it will reach --\n');

if (typeof ctx.qUpdateSendLabel === 'function') {
  ctx.AppState.queryMode = 'ask';
  ctx.qUpdateSendLabel();
  ck('Ask with everyone ticked reads "Ask 3 people"', sendBtn.textContent === 'Ask 3 people', sendBtn.textContent);
  boxes[0].checked = false;
  ctx.qUpdateSendLabel();
  ck('unticking one changes it to 2', sendBtn.textContent === 'Ask 2 people', sendBtn.textContent);
  ctx.AppState.queryMode = 'recommend';
  ctx.qUpdateSendLabel();
  ck('the same list under Recommend reads "Send to 2 people"',
     sendBtn.textContent === 'Send to 2 people', sendBtn.textContent);
  boxes.forEach((b) => { b.checked = false; });
  ctx.qUpdateSendLabel();
  ck('nobody ticked disables it', sendBtn.disabled === true && sendBtn.textContent === 'Send');
  boxes.forEach((b) => { if (!b.disabled) b.checked = true; });
} else { ck('the send label helper exists', false); }

console.log('\n-- degree 2 cannot promise a list of names --\n');

if (typeof ctx.qApplyDegreeToWho === 'function') {
  ctx.AppState.queryMode = 'ask';
  ctx.AppState.queryDegree = 2;
  ctx.qApplyDegreeToWho();
  ck('the WHO list is disabled at degree 2', whoBox.style.pointerEvents === 'none');
  ck('...and says why', /cannot choose individuals/.test(note.textContent), note.textContent);
  ck('...and the button stops counting names',
     /whole circle/.test(sendBtn.textContent), sendBtn.textContent);
  ctx.AppState.queryDegree = 1;
  ctx.qApplyDegreeToWho();
  ck('back at degree 1 the list is usable again', whoBox.style.pointerEvents === 'auto');
  ck('...and the note returns to the default',
     /unless you untick/.test(note.textContent), note.textContent);
} else { ck('the degree/who helper exists', false); }

console.log('\n-- picking something to recommend --\n');

if (typeof ctx.qItemResultsHtml === 'function') {
  const all = ctx.qItemResultsHtml('');
  ck('an empty search offers the library', /Xing Wong BBQ/.test(all) && /Gal the Exterminator/.test(all));
  const one = ctx.qItemResultsHtml('xing');
  ck('a search narrows it', /Xing Wong BBQ/.test(one) && !/Gal the Exterminator/.test(one));
  ck('searching a place works too', /Xing Wong BBQ/.test(ctx.qItemResultsHtml('ramat')));
  ck('nothing matching says so', /Nothing in your library matches/.test(ctx.qItemResultsHtml('zzzz')));
  ck('each result can be picked', /data-action="q-pick-item"/.test(all));
} else { ck('the item picker exists', false); }

console.log('\n-- recommend actually sends --\n');

if (typeof ctx.handleSendRecFromCircle === 'function') {
  ctx.AppState.queryMode = 'recommend';
  ctx.AppState.queryItemId = 'r1';
  rpcCalls.length = 0;
  boxes.forEach((b) => { if (!b.disabled) b.checked = true; });

  await ctx.handleSendRecFromCircle(sendBtn);

  ck('only the in-app members go through the RPC', rpcCalls.length === 2,
     rpcCalls.map((c) => c.args.p_member_id).join(',') || 'none');
  ck('...through send_rec_to_member, with the chosen item',
     rpcCalls.every((c) => c.fn === 'send_rec_to_member' && c.args.p_rec_id === 'r1'));
  ck('the delivered one is reported', /Sent to 1 person/.test(result.innerHTML), result.innerHTML);
  ck('the one who already had it is named, not counted',
     /Rany Shapiro/.test(result.innerHTML) && /already had it/.test(result.innerHTML));
  ck('the WhatsApp member gets a one-tap link, not a claim of delivery',
     /wa\.me\/972500000003/.test(result.innerHTML));
  ck('a delivered person is unticked so a second press cannot double-send',
     boxes.find((b) => b.dataset.memberId === 'm1').checked === false);
  ck('...and the one still needing a tap stays ticked',
     boxes.find((b) => b.dataset.memberId === 'm3').checked === true);
} else { ck('recommend-from-circle exists', false, 'handleSendRecFromCircle is missing'); }

console.log('\n-- the screen and the send agree (source) --\n');

ck('the screen offers both verbs',
   /data-action="q-mode" data-mode="ask"/.test(src) && /data-mode="recommend"/.test(src));
ck('one send button serves both', /data-action="q-send"/.test(src));
ck('the circle picker is shared, not duplicated',
   (src.match(/id="q-circle-picker"/g) || []).length === 1);
// THE BUG FOUND WHILE BUILDING: degree was hard-coded at the send.
ck('the send reads the degree the screen shows',
   /const degree = AppState\.queryDegree === 2 \? 2 : 1;/.test(src),
   'it used to send degree: 1 whatever the toggle said');
ck('...and never sends chosen members at degree 2',
   /degree === 1 \? qChosen\(\)/.test(src),
   'a name list cannot describe an anonymous second level');

console.log('\n-- send-query: the server enforces the same rule --\n');

// THE REAL FILTER, lifted from the deployed function and run. The client greys
// the list at degree 2; this is the half that cannot be bypassed by anyone
// calling the endpoint directly.
const qsrc = fs.readFileSync(useOld
  ? path.join(__dirname, 'send-query.pre-v0.88.0.ts')
  : path.join(__dirname, '..', 'supabase', 'functions', 'send-query', 'index.ts'), 'utf8');

ck('send-query accepts a chosen list at all', /member_ids\?: string\[\]/.test(qsrc),
   'it took a circle and messaged every member of it');

const at = qsrc.indexOf('const chosen = Array.isArray(body.member_ids)');
if (at > -1) {
  const end = qsrc.indexOf('if (reachable.length === 0)', at);
  const fbody = qsrc.slice(at, end)
    .replace(/\(m: any\)/g, '(m)')
    .replace(/return err\("no_chosen_member_is_in_this_circle"\);/, 'return "REFUSED";');
  const run = new Function('body', 'degree', 'reachableIn',
    'let reachable = reachableIn;\n' + fbody + '\nreturn reachable;');
  const all = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];

  ck('no list means the whole circle - what every earlier caller meant',
     run({}, 1, all).length === 3);
  ck('an empty list also means the whole circle',
     run({ member_ids: [] }, 1, all).length === 3);
  ck('a chosen list narrows it to exactly those people',
     run({ member_ids: ['m1', 'm3'] }, 1, all).map(function(m) { return m.id; }).join(',') === 'm1,m3');
  ck('an id that is not in this circle is ignored, not messaged',
     run({ member_ids: ['m1', 'nope'] }, 1, all).length === 1);
  ck('a list matching NOBODY is refused, never widened to everyone',
     run({ member_ids: ['nobody'] }, 1, all) === 'REFUSED',
     'silently messaging the whole circle would be the worst possible failure');
  ck('at degree 2 the chosen list is ignored - it cannot describe who is reached',
     run({ member_ids: ['m1'] }, 2, all).length === 3);
} else {
  ck('the chosen-members filter exists', false, 'not found in send-query');
}

console.log('\n  ' + (useOld ? 'BASELINE v0.87.2 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
