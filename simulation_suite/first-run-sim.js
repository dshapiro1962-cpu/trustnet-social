// first-run-sim.js - Release 3 of the October overhaul (v0.99.16): the first run.
//
// dan, 13 Oct, on Home's first visit: "change the order 1. create your first
// circle. we have to change the creat circle stage to include adding a freind
// ... 2. put trusnet on your home screen 3. ask or reccomend. should put
// arrows between the stages to make clear they are steps in a process"; 15
// Oct: "for now no lock", and the film only until the first circle. On New
// circle: "find a better term for domain" (Topic, v0.99.13) and "colour should
// show actual colours not a code". On Add friends: "this stage is very
// confusing and not necessary ... should go straight to s26", "dont need the
// place for pasted numbers", "when you start typing name should show list",
// "response rate is unnecessary".
//
// What must be true:
//   - three steps in that order, joined by arrows, every one tappable, the
//     one you are on marked Start here / Next; a computer sees two
//   - the film shows only until a circle exists
//   - New circle offers colours as colours, and Create goes straight on to
//     adding friends in the same sheet, Home still behind it
//   - Add friends is the form at once: no paste box, no Response rate, Notes,
//     and WhatsApp picked means the NUMBER box shows (it showed the email box
//     before - found while building this)
//   - after each friend the new-circle sheet stays open and says who was
//     added; Done closes it and Home moves to the next step
//   - typing a name offers your people from other circles
//   - adding from a circle's own + still closes after one, as before
//   - editing someone keeps the response rate they already had
//
// The REAL app in Chrome at 390x844, Supabase stubbed, every write recorded.
//
//   node first-run-sim.js        -> must PASS
//   node first-run-sim.js --old  -> pre-v0.99.16/index.html, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-v0.99.16', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 220) : '')); }
};
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
};

function seed(kind) {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  CURRENT_UID = 'u0';
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Maya Levi', avatar: 'ML', avatarColor: '#1D5A45', bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'maya@example.com', joinedDate: iso(now - d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._feed = []; AppState._notifications = []; AppState.suggestions = []; AppState.userCollections = []; AppState.userQueries = [];
  AppState.userCircles = []; AppState.userMembers = []; AppState.userRecs = []; AppState.userCanonicals = [];
  if (kind === 'fresh') return;
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: '#1A6FA8', location: '', isOwn: true, createdAt: iso(now - 9 * d), memberIds: ['m1'] }];
  AppState.userMembers = [{ id: 'm1', circleId: 'c1', name: 'Rany Cohen', avatar: 'RC', avatarColor: '#4E7C5D', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000004', responseRate: 'low', isExternalSource: false, linkedUserId: null, personId: 'p1', addedAt: iso(now - 9 * d) }];
}
function look() {
  var vis = function (el) { if (!el) return false; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var steps = [].filter.call(document.querySelectorAll('#view-body .tn-step'), vis).map(function (s) {
    var r = s.getBoundingClientRect();
    return { t: ((s.querySelector('.tn-step-t b') || {}).innerText || '').trim(), on: s.classList.contains('on'), done: s.classList.contains('done'),
      tag: ((s.querySelector('.tn-step-tag') || {}).innerText || '').trim(), top: r.top, bottom: r.bottom };
  });
  var arrows = [].filter.call(document.querySelectorAll('#view-body .tn-step-arrow'), vis).map(function (a) { var r = a.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
  var head = (document.getElementById('onboarding-card') || {}).innerText || '';
  return { steps: steps, arrows: arrows, head: head.replace(/\s+/g, ' '), film: !!document.querySelector('#view-body .tn-film'),
    locks: (document.getElementById('view-body').innerText.match(/Once Trustnet is on your home screen|Opens once/g) || []).length, view: AppState.currentView };
}
function sheet() {
  var vis = function (el) { if (!el) return false; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var m = document.querySelector('#modal-root .modal');
  if (!m) return null;
  return { title: ((m.querySelector('.modal-title') || {}).innerText || '').trim(), text: m.innerText,
    buttons: [].filter.call(m.querySelectorAll('.modal-footer button'), vis).map(function (b) { return b.innerText.trim(); }),
    nameShown: vis(document.getElementById('nm-name')), phoneShown: vis(document.getElementById('nm-phone')), emailShown: vis(document.getElementById('nm-contact')),
    contactLabel: ((document.getElementById('nm-contact-label') || {}).innerText || '').trim(),
    swatches: m.querySelectorAll('.tn-swatch').length, colourSelect: !!m.querySelector('select#nc-color, select#ec-color'),
    hexShown: /#[0-9A-F]{6}/i.test(m.innerText) };
}

(async () => {
  console.log('\n   fixture: ' + path.basename(path.dirname(INDEX)) + '/index.html' + (OLD ? '   (must FAIL)' : '') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const open = async (o) => {
    const wire = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: o.ua !== 'desktop', hasTouch: true, userAgent: UA[o.ua || 'iphone'] });
    await ctx.addInitScript({ content: (o.icon ? 'try{Object.defineProperty(navigator,"standalone",{get:function(){return true;}});}catch(e){}' : '')
      + 'window.open=function(){return null;};window.confirm=function(){return true;};' });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/' || p === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(INDEX) });
      const f = path.join(REPO, 'web', decodeURIComponent(p));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: '' });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const json = (x, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(x) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      const t = p.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (t && (req.method() === 'POST' || req.method() === 'PATCH')) { wire.push({ kind: 'write', table: t[1], rows: [].concat(body || []) }); return json([], 201); }
      const r = p.match(/^\/rest\/v1\/rpc\/(.+)$/);
      if (r) {
        wire.push({ kind: 'rpc', fn: r[1], args: body || {} });
        if (r[1] === 'resolve_contact') return json([{ state: 'new' }]);
        if (r[1] === 'search_my_people') return json(String((body || {}).p_q || '').toLowerCase().indexOf('ra') === 0
          ? [{ person_id: 'p1', name: 'Rany Cohen', on_trustnet: false, contacts: [{ method: 'whatsapp', value: '+972500000004' }], circles: [{ id: 'c1', name: 'Travel' }] }] : []);
        if (r[1] === 'link_member') return json({ linked: false });
        return json(null);
      }
      return json([]);
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com/');
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.evaluate((x) => {
      (0, eval)('(' + x.seed + ')')(x.kind);
      // After a save the app reloads from the database; this stub's is empty,
      // so the reload is counted and the state left as the database would have it.
      (0, eval)('loadUserData = async function () { window.__reloads = (window.__reloads || 0) + 1; }');
      document.getElementById('login').style.display = 'none';
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      (0, eval)(x.go);
    }, { seed: seed.toString(), kind: o.kind || 'fresh', go: o.go || "showView('home')" });
    await page.waitForTimeout(500);
    return { ctx, page, wire, errs };
  };
  const section = async (fn) => { try { await fn(); } catch (e) { ck('scenario ran to the end', false, String(e && e.message || e).split(/\n/)[0]); } };
  const writes = (wire, table) => wire.filter((w) => w.kind === 'write' && w.table === table).map((w) => w.rows).flat();
  const click = (page, sel) => page.click(sel, { timeout: 5000 });

  console.log('== 1. the steps ==\n');
  await section(async () => {
    const { ctx, page, errs } = await open({});
    const L = await page.evaluate(look);
    const titles = L.steps.map((s) => s.t);
    ck('three steps, in dan\'s order', JSON.stringify(titles) === JSON.stringify(['Create your first circle', 'Put Trustnet on your home screen', 'Ask or recommend']), JSON.stringify(titles));
    ck('...the first is the one you are on, marked Start here', L.steps[0] && L.steps[0].on && /start here/i.test(L.steps[0].tag), JSON.stringify(L.steps[0]));
    ck('...joined by an arrow between each', L.arrows.length === 2 && L.steps.length === 3 && L.arrows[0] > L.steps[0].bottom - 12 && L.arrows[0] < L.steps[1].top + 12 && L.arrows[1] > L.steps[1].bottom - 12 && L.arrows[1] < L.steps[2].top + 12,
       JSON.stringify(L.arrows));
    ck('...nothing locked', L.locks === 0, L.locks);
    ck('...Step 1 of 3', /Step 1 of 3/.test(L.head), L.head);
    ck('the film is offered before anything is set up', L.film);
    const b2 = await page.$('#view-body .tn-step[data-modal="home-screen"]');
    if (b2) await b2.click();
    await page.waitForTimeout(300);
    ck('the home-screen step opens before the circle exists', /home screen/i.test(((await page.evaluate(sheet)) || {}).title || ''), JSON.stringify(await page.evaluate(sheet)).slice(0, 100));
    await page.evaluate(() => closeModal());
    const ask = await page.$('#view-body .tn-step [data-action="tn-go-query"][data-mode="ask"]');
    if (ask) await ask.click();
    await page.waitForTimeout(300);
    ck('...and so does Ask', (await page.evaluate(() => AppState.currentView)) === 'query');
    ck('no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  });
  await section(async () => {
    const { ctx, page } = await open({ ua: 'desktop' });
    const L = await page.evaluate(look);
    ck('a computer sees two steps - no home screen', JSON.stringify(L.steps.map((s) => s.t)) === JSON.stringify(['Create your first circle', 'Ask or recommend']) && /Step 1 of 2/.test(L.head), JSON.stringify(L.steps.map((s) => s.t)) + ' ' + L.head);
    await ctx.close();
  });

  console.log('\n== 2. a new circle, then its friends ==\n');
  await section(async () => {
    const { ctx, page, wire, errs } = await open({});
    await click(page, '#view-body .tn-step[data-modal="add-circle"]');
    await page.waitForTimeout(300);
    let S = await page.evaluate(sheet);
    ck('New circle offers colours as colours, no codes', S && S.swatches === 8 && !S.colourSelect && !S.hexShown, JSON.stringify(S && { swatches: S.swatches, select: S.colourSelect, hex: S.hexShown }));
    const sw = await page.$$('.tn-swatch');
    if (sw[2]) await sw[2].click();
    const picked = await page.evaluate(() => ({ v: (document.getElementById('nc-color') || {}).value, on: [].map.call(document.querySelectorAll('.tn-swatch.on'), (b) => b.dataset.colour) }));
    ck('...tapping one picks it', picked.v === '#C0392B' && JSON.stringify(picked.on) === '["#C0392B"]', JSON.stringify(picked));
    await page.fill('#nc-name', 'Food');
    await click(page, '[data-action="save-circle"]');
    await page.waitForTimeout(900);
    const circ = writes(wire, 'circles').find((r) => r.name === 'Food');
    ck('the circle is saved, in that colour', !!circ && circ.color === '#C0392B', JSON.stringify(circ));
    S = await page.evaluate(sheet);
    ck('the same sheet goes straight on to friends', S && /Add friends to Food/.test(S.title) && /Your circle is ready/.test(S.text), S && S.title);
    ck('...Home is still behind it', (await page.evaluate(() => AppState.currentView)) === 'home');
    ck('...the form is there at once', S && S.nameShown, JSON.stringify(S && { name: S.nameShown }));
    ck('...no paste box, no response rate, Notes not "why do you trust them"', S && !/Paste a number/i.test(S.text) && !/RESPONSE RATE/i.test(S.text) && /NOTES/.test(S.text) && !/why do you trust/i.test(S.text),
       S && S.text.replace(/\n/g, ' | ').slice(0, 200));
    ck('...WhatsApp picked, so the NUMBER box shows', S && S.phoneShown && !S.emailShown && /WHATSAPP NUMBER/.test(S.contactLabel), JSON.stringify(S && { phone: S.phoneShown, email: S.emailShown, label: S.contactLabel }));
    ck('...and you can skip it', S && S.buttons.indexOf('Skip for now') > -1 && S.buttons.indexOf('Add') > -1, JSON.stringify(S && S.buttons));
    await page.fill('#nm-name', 'Noa Ben-Ami');
    if (await page.isVisible('#nm-phone')) { await page.selectOption('#nm-country', 'IL').catch(() => {}); await page.fill('#nm-phone', '54 333 4444'); }
    await click(page, '#nm-save-btn');
    await page.waitForTimeout(1200);
    const mem = writes(wire, 'members').find((r) => r.name === 'Noa Ben-Ami');
    ck('the friend is saved, in the new circle, with the number', !!mem && mem.contact_method === 'whatsapp' && /543334444$/.test(mem.contact_value || '') && circ && mem.circle_id === circ.id, JSON.stringify(mem));
    S = await page.evaluate(sheet);
    ck('the sheet stays open and says who was added', S && /Noa Ben-Ami added/.test(S.text) && /Add friends to Food/.test(S.title), S && S.text.slice(0, 120));
    ck('...with Done instead of Skip', S && S.buttons.indexOf('Done') > -1, JSON.stringify(S && S.buttons));
    const doneBtn = await page.$('.modal-footer [data-action="close-modal"]');
    if (doneBtn) await doneBtn.click();
    await page.waitForTimeout(400);
    const L = await page.evaluate(look);
    ck('Done: Home shows the first step done', L.steps[0] && L.steps[0].done && /Food/.test(L.steps[0].t), JSON.stringify(L.steps[0]));
    ck('...and the home screen as Next', L.steps[1] && L.steps[1].on && /next/i.test(L.steps[1].tag) && /Step 2 of 3/.test(L.head), JSON.stringify(L.steps[1]) + ' ' + L.head);
    ck('...and the film has gone', !L.film);
    ck('no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  });
  await section(async () => {
    const { ctx, page } = await open({ kind: 'existing', go: "AppState.userMembers=[]; AppState.userCircles[0].memberIds=[]; showView('home')" });
    const L = await page.evaluate(look);
    ck('a circle with nobody in it: step one asks for its friends', L.steps[0] && L.steps[0].on && /Add friends to Travel/.test(L.steps[0].t), JSON.stringify(L.steps[0]));
    await ctx.close();
  });

  console.log('\n== 3. adding friends anywhere else ==\n');
  await section(async () => {
    const { ctx, page, wire } = await open({ kind: 'existing', go: "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1'})" });
    let S = await page.evaluate(sheet);
    ck('a circle\'s + opens the form at once', S && /Add to Travel/.test(S.title) && S.nameShown && !/Paste a number/i.test(S.text), S && S.title);
    await page.click('#nm-name'); await page.keyboard.type('Ra', { delay: 10 });
    await page.waitForTimeout(700);
    const res = await page.evaluate(() => (document.getElementById('nm-search-results') || {}).innerText || '');
    ck('typing a name offers your people from other circles', /Already in your circles/i.test(res) && /Rany Cohen/.test(res), res.replace(/\n/g, ' | '));
    await page.fill('#nm-name', 'Yoav Gal');
    await page.fill('#nm-phone', '52 811 4460');
    await click(page, '#nm-save-btn');
    await page.waitForTimeout(1200);
    ck('...and after one, it closes as before', !(await page.evaluate(sheet)) && writes(wire, 'members').some((r) => r.name === 'Yoav Gal'));
    await ctx.close();
  });
  await section(async () => {
    const { ctx, page, wire } = await open({ kind: 'existing', go: "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1',editMemberId:'m1'})" });
    await click(page, '#nm-save-btn');
    await page.waitForTimeout(1200);
    const row = writes(wire, 'members').find((r) => r.id === 'm1');
    ck('editing someone keeps the response rate they had', !!row && row.response_rate === 'low', JSON.stringify(row));
    await ctx.close();
  });
  await section(async () => {
    const { ctx, page, wire } = await open({ kind: 'existing', go: "showView('circle-detail',{circleId:'c1'}); openModal('edit-circle',{circleId:'c1'})" });
    const S = await page.evaluate(sheet);
    const on = await page.evaluate(() => [].map.call(document.querySelectorAll('.tn-swatch.on'), (b) => b.dataset.colour));
    ck('Edit circle: colours as colours, its own one picked', S && S.swatches === 8 && !S.colourSelect && JSON.stringify(on) === '["#1A6FA8"]', JSON.stringify({ sw: S && S.swatches, on }));
    const sw = await page.$$('.tn-swatch');
    if (sw[4]) await sw[4].click();
    await click(page, '[data-action="save-edit-circle"]');
    await page.waitForTimeout(900);
    const row = writes(wire, 'circles').find((r) => r.id === 'c1');
    ck('...and saving keeps the new one', !!row && row.color === '#8B2FC9', JSON.stringify(row));
    await ctx.close();
  });

  console.log('\n== 4. from the home-screen icon ==\n');
  await section(async () => {
    const { ctx, page } = await open({ icon: true });
    const L = await page.evaluate(look);
    ck('the home-screen step is already done', L.steps[1] && L.steps[1].done && /On your home screen/.test(L.steps[1].t), JSON.stringify(L.steps.map((s) => s.t + (s.done ? ' (done)' : ''))));
    ck('...and the circle is still where you start', L.steps[0] && L.steps[0].on, JSON.stringify(L.steps[0]));
    await ctx.close();
  });

  await browser.close();
  console.log('\n  ' + (OLD ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
