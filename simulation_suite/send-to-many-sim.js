// send-to-many-sim.js — tick several people, send once.
//
// dan, 9 Sep: "i want the option to send an item from the library to more than
// one person at once thats all thats why i want to change the interface."
//
// The dialog listed every member with one button each, so sending to six
// people meant opening it six times. It now carries a tick per row, Select
// all, and one Send button whose label counts what is ticked.
//
// THE PART THAT IS NOT UNIFORM, and the reason the result line exists: in-app
// recipients go together through send_rec_to_member in one press, while
// WhatsApp and email each hand the phone to another application and a browser
// can only do that once per gesture. Those come back as one-tap links rather
// than being reported as sent.
//
// This runs THE REAL modalShareRec, srUpdateSendButton, srSelectAll and
// handleSendRecMulti in a vm, against a DOM built from the markup the real
// render produced. Every RPC is recorded so the calls can be asserted, not
// assumed.
//
//   node send-to-many-sim.js         → must PASS
//   node send-to-many-sim.js --old   → index.pre-v0.87.1.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.87.1.html')
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

// ── the members the dialog will list ──────────────────────────────────────
const MEMBERS = [
  { id: 'm1', name: 'dan test',    circleId: 'c1', linkedUserId: 'u1', contactMethod: 'email',    contactValue: 'a@x.com' },
  { id: 'm2', name: 'may shapiro', circleId: 'c2', linkedUserId: 'u2', contactMethod: 'whatsapp', contactValue: '+972528640029' },
  { id: 'm3', name: 'Tchia',       circleId: 'c3', linkedUserId: null, contactMethod: 'whatsapp', contactValue: '+972500000003' },
  { id: 'm4', name: 'Gina',        circleId: 'c3', linkedUserId: null, contactMethod: 'email',    contactValue: 'gina@x.com' },
  { id: 'm5', name: 'No Contact',  circleId: 'c3', linkedUserId: null, contactMethod: 'email',    contactValue: '' },
];

const rpcCalls = [];
const ctx = {
  console,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  avatarEl: () => '<div class="avatar"></div>',
  recShareText: () => 'Xing Wong BBQ — try it',
  toast: () => {},
  loadUserData: async () => {},
  encodeURIComponent,
  Array, String, Object, Promise, JSON, Math, Date,
  AppState: {
    userRecs: [{ id: 'r1', canonicalId: 'k1' }],
    userMembers: MEMBERS,
    canonicalById: () => ({ id: 'k1', name: 'Xing Wong BBQ Asian Cuisine' }),
    circleById: (id) => ({ id: id, name: { c1: 'test', c2: 'Travel', c3: 'Freinds' }[id] || '' }),
  },
  sb: {
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args });
      if (args.p_member_id === 'm2') return { data: { ok: false, error: 'already_sent' } };
      return { data: { ok: true } };
    },
  },
};
ctx.SUMMARY_STYLE = '';
vm.createContext(ctx);

['modalShareRec', 'srUpdateSendButton', 'srSelectAll', 'srClearSearch', 'handleSendRecMulti']
  .forEach((n) => { const code = grab(n); if (code) vm.runInContext(code, ctx); });

console.log('\n-- the dialog offers a tick per person --\n');

const markup = typeof ctx.modalShareRec === 'function'
  ? ctx.modalShareRec({ recId: 'r1' }) : '';
ck('the dialog still renders', /Xing Wong BBQ/.test(markup));

const cbs = [...markup.matchAll(/<input type="checkbox" class="sr-cb"[^>]*>/g)].map((m) => m[0]);
ck('there is a tick for every member', cbs.length === MEMBERS.length,
   'found ' + cbs.length + ' of ' + MEMBERS.length);
ck('someone with no way to reach them cannot be ticked',
   cbs.filter((c) => / disabled/.test(c)).length === 1,
   'exactly one member here has no contact');
ck('each tick carries the channel, so send knows what it can batch',
   /data-channel="app"/.test(markup) && /data-channel="whatsapp"/.test(markup)
     && /data-channel="email"/.test(markup));
ck('there is a Select all', /data-action="sr-select-all"/.test(markup));
ck('there is ONE send button, outside the scrolling list',
   (markup.match(/data-action="send-rec-multi"/g) || []).length === 1
     && markup.indexOf('data-action="send-rec-multi"') > markup.indexOf('overflow-y:auto'));
ck('it starts disabled — nothing is ticked yet', /id="sr-send"[^>]*disabled/.test(markup));
ck('the per-row send buttons are gone',
   !/data-action="send-rec-in-app"/.test(markup),
   'one button per row is exactly what made six sends take six visits');

// ── a DOM the real helpers can drive ──────────────────────────────────────
const boxes = cbs.map((tag) => ({
  dataset: {
    memberId: (tag.match(/data-member-id="([^"]+)"/) || [])[1],
    channel: (tag.match(/data-channel="([^"]+)"/) || [])[1],
  },
  disabled: / disabled/.test(tag),
  checked: false,
  classList: { contains: (c) => c === 'sr-cb' },
}));
const rows = boxes.map((b) => ({ style: { display: 'flex' }, querySelector: () => b }));
const sendBtn = { id: 'sr-send', disabled: true, textContent: 'Send', style: { opacity: '.5' },
                  dataset: { recId: 'r1' } };
const result = { id: 'sr-result', innerHTML: '' };
ctx.document = {
  querySelectorAll: (sel) => (sel === '.sr-cb' ? boxes
    : sel === '.sr-cb:checked' ? boxes.filter((b) => b.checked)
    : sel === '.sr-row' ? rows : []),
  getElementById: (id) => (id === 'sr-send' ? sendBtn : id === 'sr-result' ? result : null),
};

console.log('\n-- the button counts what is ticked --\n');

const hasHelpers = typeof ctx.srUpdateSendButton === 'function' && typeof ctx.srSelectAll === 'function';
ck('the counting and select-all helpers exist', hasHelpers);

if (hasHelpers) {
  ctx.srUpdateSendButton();
  ck('with nothing ticked it reads "Send" and is disabled',
     sendBtn.textContent === 'Send' && sendBtn.disabled === true, sendBtn.textContent);

  boxes[0].checked = true; ctx.srUpdateSendButton();
  ck('one person reads "Send to 1 person"', sendBtn.textContent === 'Send to 1 person',
     sendBtn.textContent);

  boxes[1].checked = true; boxes[2].checked = true; ctx.srUpdateSendButton();
  ck('three read "Send to 3 people", and it is enabled',
     sendBtn.textContent === 'Send to 3 people' && sendBtn.disabled === false,
     sendBtn.textContent);

  boxes.forEach((b) => { b.checked = false; });
  ctx.srSelectAll();
  ck('Select all ticks everyone who can be reached',
     boxes.filter((b) => b.checked).length === 4 && !boxes[4].checked,
     'the contactless member must stay unticked');

  ctx.srSelectAll();
  ck('...and pressing it again clears them', boxes.every((b) => !b.checked));

  // A SEARCH IS NOT A DECISION. Rows hidden by the filter are not "all".
  rows[3].style.display = 'none'; rows[4].style.display = 'none';
  ctx.srSelectAll();
  ck('Select all means all that are SHOWING',
     boxes.filter((b) => b.checked).length === 3,
     'a filtered-out row must not be swept in');
  rows[3].style.display = 'flex'; rows[4].style.display = 'flex';
}

// GETTING BACK TO THE WHOLE LIST. dan, after using it: "if i use search member
// i cant go back to the list to continue choosing." The filter was never
// wrong - emptying the box restores every row - but the box had no type and
// therefore no clear cross, so the only way back was backspacing with the
// keyboard covering the list.
console.log('\n-- and a way back from a search --\n');
ck('the search box is a search box, so the platform can offer its own clear',
   /id="sr-search"[^>]*type="search"|type="search"[^>]*id="sr-search"/.test(markup),
   'type defaulted to text, which has no clear control anywhere');
ck('there is a clear that does not depend on the platform',
   /data-action="sr-clear-search"/.test(markup));

if (typeof ctx.srClearSearch === 'function') {
  // a search is on, hiding most people, and two are already ticked
  boxes.forEach(function(b) { b.checked = false; });
  boxes[0].checked = true; boxes[2].checked = true;
  rows.forEach(function(r, i) { r.style.display = i === 1 ? 'flex' : 'none'; });
  const searchBox = { id: 'sr-search', value: 'may' };
  const prevGet = ctx.document.getElementById;
  ctx.document.getElementById = function(id) {
    return id === 'sr-search' ? searchBox : prevGet(id);
  };

  ctx.srClearSearch();
  ck('clearing empties the box', searchBox.value === '');
  ck('...and every row is showing again',
     rows.every(function(r) { return r.style.display === 'flex'; }),
     'this is the list dan could not get back to');
  ck('...and the people already ticked are STILL ticked',
     boxes[0].checked === true && boxes[2].checked === true,
     'clearing a filter is not unchoosing someone');
  ck('...and the send button still counts them', sendBtn.textContent === 'Send to 2 people',
     sendBtn.textContent);
  ctx.document.getElementById = prevGet;
} else {
  ck('there is a clear-search handler at all', false, 'srClearSearch does not exist');
}

console.log('\n-- one press, and an honest result --\n');

if (typeof ctx.handleSendRecMulti === 'function') {
  boxes.forEach((b) => { b.checked = false; });
  boxes[0].checked = true;   // in app, succeeds
  boxes[1].checked = true;   // in app, already_sent
  boxes[2].checked = true;   // WhatsApp — cannot be batched
  boxes[3].checked = true;   // email    — cannot be batched
  rpcCalls.length = 0;

  await ctx.handleSendRecMulti(sendBtn);

  ck('only the in-app people go through the RPC', rpcCalls.length === 2,
     rpcCalls.length + ' calls: ' + rpcCalls.map((c) => c.args.p_member_id).join(','));
  ck('...through send_rec_to_member, with the right item',
     rpcCalls.every((c) => c.fn === 'send_rec_to_member' && c.args.p_rec_id === 'r1'));
  ck('the one that worked is reported as sent', /Sent to 1 person/.test(result.innerHTML),
     result.innerHTML);
  ck('the one who already had it is named, not counted as sent',
     /may shapiro/.test(result.innerHTML) && /already had it/.test(result.innerHTML));
  ck('WhatsApp and email are offered as one-tap links, not claimed as sent',
     /wa\.me\/972500000003/.test(result.innerHTML) && /mailto:gina@x\.com/.test(result.innerHTML),
     'a browser can only hand off to another app once per gesture');
  ck('...and are described as needing a tap each',
     /one tap each/.test(result.innerHTML));
  ck('a delivered person is unticked, so a second press cannot double-send',
     boxes[0].checked === false);
  ck('...while the ones still to do stay ticked',
     boxes[2].checked === true && boxes[3].checked === true);
} else {
  ck('there is a bulk send at all', false, 'handleSendRecMulti does not exist');
}

console.log('\n  ' + (useOld ? 'BASELINE v0.87.0 (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
