// save-and-send-sim.js — saving something and passing it on in one action.
//
// dan, 15 Sep: "the + button should open a menu where you can save a
// recommendation or make a recommendation to your circle, with the option of
// saving and recommending in one action", and then: "there should be an option
// to send to my circle".
//
// THE TOGGLE IS THE GUARD, THE CIRCLE IS THE DEFAULT. Saving privately is the
// common case, so "Also send it to people" starts OFF and nothing leaves the
// library. Turning it on is deliberate - and from that point the whole circle
// is the default, which is the rule v0.88.0 already set on the Recommend
// screen: unticking is the new gesture, not ticking. Getting that backwards
// would fire at everyone's circle every time they saved a link, and they would
// find out afterwards.
//
// This runs THE REAL arSendBoxHtml, arSendTargets and arUpdateSaveLabel in a
// vm over a DOM built from the markup the real render produced.
//
//   node save-and-send-sim.js         → must PASS
//   node save-and-send-sim.js --old   → index.pre-v0.94.0.html, must FAIL

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const useOld = process.argv.indexOf('--old') > -1;
const file = useOld
  ? path.join(__dirname, 'index.pre-v0.94.0.html')
  : path.join(__dirname, '..', 'web', 'index.html');
if (!fs.existsSync(file)) { console.error('missing fixture: ' + file); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + x : '')); }
};

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

// Travel: two reachable, one with no way to be reached, one external source.
const MEMBERS = [
  { id: 'm1', name: 'Tom Shapiro', circleId: 'c1', isExternalSource: false, linkedUserId: 'u1', contactMethod: 'whatsapp', contactValue: '+972500000001' },
  { id: 'm2', name: 'may shapiro', circleId: 'c1', isExternalSource: false, linkedUserId: null, contactMethod: 'whatsapp', contactValue: '+972500000002' },
  { id: 'm3', name: 'Tchia', circleId: 'c1', isExternalSource: false, linkedUserId: null, contactMethod: 'email', contactValue: '' },
  { id: 'm9', name: 'A Critic', circleId: 'c1', isExternalSource: true, linkedUserId: null, contactMethod: 'email', contactValue: 'c@x.com' },
  { id: 'm5', name: 'Someone', circleId: 'c2', isExternalSource: false, linkedUserId: 'u5', contactMethod: 'email', contactValue: 's@x.com' },
];

function world() {
  const els = {};
  const el = (id, extra) => (els[id] = Object.assign(
    { id, style: {}, innerHTML: '', textContent: '', value: '', checked: false, dataset: {} }, extra || {}));
  el('ar-circle', { value: 'c1' });
  el('ar-send', { checked: false });
  el('ar-send-box');
  el('ar-save');

  let boxes = [];
  const ctx = {
    console, Array, String, Object, Number, JSON, Math, parseInt, setTimeout,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    avatarEl: () => '<div class="avatar"></div>',
    qChosen: () => boxes.filter((b) => b.checked && b.dataset.memberId !== '__all__')
      .map((b) => ({ memberId: b.dataset.memberId, channel: b.dataset.channel })),
    AppState: {
      membersOfCircle: (cid) => MEMBERS.filter((m) => m.circleId === cid),
      circleById: (id) => ({ c1: { id: 'c1', name: 'Travel' }, c2: { id: 'c2', name: 'Food' } }[id] || null),
    },
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => (sel.indexOf('__all__') > -1
        ? boxes.find((b) => b.dataset.memberId === '__all__') || null
        : (sel === '#q-who' ? (els['q-who'] || null) : null)),
      querySelectorAll: () => boxes,
    },
  };
  vm.createContext(ctx);
  ['qWhoHtml', 'arSendBoxHtml', 'arSendTargets', 'arUpdateSaveLabel', 'arSendRefresh']
    .forEach((n) => { const c = grab(n); if (c) vm.runInContext(c, ctx); });

  // Rebuild the checkbox list from whatever markup the real function emitted.
  const sync = () => {
    const h = els['ar-send-box'].innerHTML;
    boxes = [...h.matchAll(/<input type="checkbox" class="qw-cb"[^>]*>/g)].map((m) => ({
      dataset: { memberId: (m[0].match(/data-member-id="([^"]+)"/) || [])[1],
                 channel: (m[0].match(/data-channel="([^"]+)"/) || [])[1] },
      disabled: / disabled/.test(m[0]),
      checked: / checked/.test(m[0]),
    }));
    els['q-who'] = /id="q-who"/.test(h) ? { id: 'q-who' } : null;
  };
  return { ctx, els, sync, boxes: () => boxes };
}

console.log('\n   fixture: ' + path.basename(file) + (useOld ? '   (must FAIL)' : '') + '\n');

// ── 1. THE MENU ─────────────────────────────────────────────────────────
console.log('== the plus menu ==\n');
const live = src.replace(/^\s*\/\/[^\n]*$/gm, '');
ck('the plus no longer offers "Ask a question"',
   !/fab-ask/.test(live),
   'it was the same destination as the ask box on Home');
ck('it offers Save a recommendation', /data-action="fab-save"/.test(live));
ck('...and Recommend to a circle', /data-action="fab-recommend"/.test(live));
ck('and Recommend SETS the verb rather than inheriting the last one used',
   /fab-recommend'\)[\s\S]{0,260}queryMode = 'recommend'/.test(live),
   'every other door into that screen is labelled Ask and sets nothing');

// ── 2. OFF BY DEFAULT ───────────────────────────────────────────────────
console.log('\n== the toggle is the guard ==\n');
{
  const w = world();
  ck('arSendTargets exists', typeof w.ctx.arSendTargets === 'function',
     'without it nothing can be sent alongside a save');
  if (typeof w.ctx.arSendTargets === 'function') {
    ck('with the toggle OFF, nobody is a target',
       w.ctx.arSendTargets().length === 0,
       'saving privately is the common case; this must not leak');
    w.ctx.arUpdateSaveLabel();
    ck('...and the button just says Add to Library',
       w.els['ar-save'].textContent === 'Add to Library',
       'got ' + JSON.stringify(w.els['ar-save'].textContent));
  }
}

// ── 3. ON → THE WHOLE CIRCLE ────────────────────────────────────────────
console.log('\n== turned on, the circle is the default ==\n');
{
  const w = world();
  w.els['ar-send'].checked = true;
  w.els['ar-send-box'].innerHTML = w.ctx.arSendBoxHtml('c1', false);
  w.sync();
  ck('it offers the circle as one tick, already ticked',
     /Everyone in Travel/.test(w.els['ar-send-box'].innerHTML)
     && w.boxes().length === 1 && w.boxes()[0].checked,
     'v0.88.0: unticking is the new gesture, not ticking');
  ck('the count is REACHABLE members, not circle size',
     />2<\/span>/.test(w.els['ar-send-box'].innerHTML),
     'Tchia has no contact details and the external source cannot be messaged');
  const t = w.ctx.arSendTargets();
  ck('and it resolves to those two people', t.length === 2,
     'got ' + JSON.stringify(t.map((x) => x.memberId)));
  ck('with the channel each one needs',
     t.some((x) => x.memberId === 'm1' && x.channel === 'app')
     && t.some((x) => x.memberId === 'm2' && x.channel === 'whatsapp'));
  w.ctx.arUpdateSaveLabel();
  ck('the button says what pressing it will do',
     w.els['ar-save'].textContent === 'Save and send to 2',
     'got ' + JSON.stringify(w.els['ar-save'].textContent));
}

// ── 4. UNTICKING THE CIRCLE SENDS NOTHING ───────────────────────────────
{
  const w = world();
  w.els['ar-send'].checked = true;
  w.els['ar-send-box'].innerHTML = w.ctx.arSendBoxHtml('c1', false);
  w.sync();
  w.boxes()[0].checked = false;
  ck('unticking "everyone" sends to nobody',
     w.ctx.arSendTargets().length === 0,
     'the toggle being on is not consent on its own');
}

// ── 5. EXPANDED, IT IS THE RECOMMEND SCREEN'S OWN LIST ──────────────────
console.log('\n== expanded to named people ==\n');
{
  const w = world();
  w.els['ar-send'].checked = true;
  w.els['ar-send-box'].innerHTML = w.ctx.arSendBoxHtml('c1', true);
  w.sync();
  ck('one row per member of THAT circle', w.boxes().length === 3,
     'got ' + w.boxes().length + ' - external sources must not appear');
  ck('everyone reachable starts ticked',
     w.boxes().filter((b) => b.checked).length === 2);
  ck('someone with no way to be reached is shown but cannot be ticked',
     w.boxes().filter((b) => b.disabled).length === 1,
     'leaving them out would look like they had left the circle');
  const t = w.ctx.arSendTargets();
  ck('targets come from the ticks, not from the circle',
     t.length === 2 && t.every((x) => x.memberId !== '__all__'));
}

// ── 6. NO CIRCLE, NO SEND ───────────────────────────────────────────────
console.log('\n== the edges ==\n');
{
  const w = world();
  w.els['ar-circle'].value = '';
  w.els['ar-send'].checked = true;
  const h = w.ctx.arSendBoxHtml('', false);
  ck('with no circle chosen it says so rather than offering nothing',
     /Choose a circle above first/.test(h),
     'an empty box reads as "nobody to send to"');
  ck('...and resolves to no targets', w.ctx.arSendTargets().length === 0);
}
{
  const w = world();
  w.els['ar-circle'].value = 'c2';
  w.els['ar-send'].checked = true;
  w.els['ar-send-box'].innerHTML = w.ctx.arSendBoxHtml('c2', false);
  w.sync();
  ck('a different circle offers that circle',
     /Everyone in Food/.test(w.els['ar-send-box'].innerHTML));
  ck('...and its own member', w.ctx.arSendTargets().length === 1);
}

// ── 7. THE SAVE HAPPENS FIRST ───────────────────────────────────────────
console.log('\n== save first, then send ==\n');
ck('the send runs only after saveRecs has succeeded',
   /await saveRecs\(\[newRec\.id\]\)[\s\S]{0,900}arSendTargets\(\)/.test(live),
   'sending first could put an item in an inbox for a row never written');
ck('and it reuses sendRecToMany rather than a second implementation',
   /arSendTargets\(\)[\s\S]{0,400}sendRecToMany\(newRec/.test(live));
ck('anyone who could not be reached is NAMED, not counted',
   /could not reach ' \+ r\.failed\.join/.test(live),
   'a browser hands off once per gesture; pretending otherwise is the one thing this must not do');

console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': '
  + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
