// recommend-new-sim.js - Recommend takes something NEW as well as something
// from Saved (v0.99.14).
//
// dan, 15 Oct: "recommend is not as i requested - it should give the option
// to recommend things that are not in saved as well as the option to retrieve
// from the library". And 15 Oct, earlier: something new you recommend also
// goes into your Saved.
//
// What must be true:
//   - Recommend's box takes a name or a link; what you have saved that
//     matches is offered under it, and picking one works as before
//   - something typed that is not saved is SAVED FIRST, into the circle on
//     screen, and only then sent - and a second press sends that one, not a
//     second copy
//   - typing the exact name of something saved sends that one, no duplicate
//   - a pasted link is read (ingest-link, once) and its name put in the box
//   - the Save sheet has no Fetch: a pasted link fills it, and saving and
//     sending from it still work
//   - ONE WAY TO SAVE: a new saved item is built in exactly one place, and
//     both the Save sheet and Recommend go through it
//
// The REAL app in Chrome at 390x844. Supabase is stubbed and every write is
// recorded in order, so "saved before sent" is read off the wire.
//
//   node recommend-new-sim.js        -> must PASS
//   node recommend-new-sim.js --old  -> pre-recommend-new/index.html, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-recommend-new', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 220) : '')); }
};

function seed() {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  CURRENT_UID = 'u0';
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: '#1D5A45', bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._feed = []; AppState._notifications = []; AppState.suggestions = []; AppState.userCollections = []; AppState.userQueries = [];
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: '#2C5877', location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2'] }];
  AppState.userMembers = [
    { id: 'm1', circleId: 'c1', name: 'Tom Shapiro', avatar: 'TS', avatarColor: '#3F6C8A', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000001', responseRate: 'unknown', isExternalSource: false, linkedUserId: 'u1', personId: 'p1', addedAt: iso(now - 9 * d) },
    { id: 'm2', circleId: 'c1', name: 'Rany', avatar: 'R', avatarColor: '#4E7C5D', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000004', responseRate: 'unknown', isExternalSource: false, linkedUserId: 'u4', personId: 'p2', addedAt: iso(now - 9 * d) }];
  AppState.userCanonicals = [
    { id: 'k1', type: 'place', name: 'Masseria Moroseta', category: '', kind: 'hotel', location: 'Ostuni, Puglia', description: '', imageEmoji: '', primaryCategory: 'travel', aiTags: [], imageUrl: '', hasSearchDoc: true },
    { id: 'k2', type: 'place', name: 'Arte', category: '', kind: 'restaurant', location: 'Lecce', description: '', imageEmoji: '', primaryCategory: 'dining', aiTags: [], imageUrl: '', hasSearchDoc: true }];
  AppState.userRecs = [
    { id: 'r1', canonicalId: 'k1', circleId: 'c1', recommendedBy: 'm1', note: 'Book the terrace.', rating: 5, tags: [], status: 'saved', date: iso(now - d), category: '' },
    { id: 'r2', canonicalId: 'k2', circleId: 'c1', recommendedBy: 'u0', note: 'Ask for the orecchiette.', rating: 5, tags: [], status: 'saved', date: iso(now - 2 * d), category: '' }];
}

(async () => {
  console.log('\n   fixture: ' + path.basename(path.dirname(INDEX)) + '/index.html' + (OLD ? '   (must FAIL)' : '') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const INGEST = { name: 'Osteria degli Spiriti', location: 'Lecce', note: 'Book the back room.', category: 'dining', url: 'https://www.osteriadeglispiriti.it/', needs_review: false };
  const open = async (screen) => {
    const wire = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript({ content: 'try{Object.defineProperty(navigator,"standalone",{get:function(){return true;}});}catch(e){}window.open=function(){return null;};' });
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
      const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      const t = p.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (t && (req.method() === 'POST' || req.method() === 'PATCH')) { wire.push({ kind: 'write', table: t[1], rows: [].concat(body || []) }); return json([], 201); }
      const r = p.match(/^\/rest\/v1\/rpc\/(.+)$/);
      if (r) { wire.push({ kind: 'rpc', fn: r[1], args: body || {} }); return json(r[1] === 'send_rec_to_member' ? { ok: true } : null); }
      const f = p.match(/^\/functions\/v1\/([^/?]+)/);
      if (f) { wire.push({ kind: 'fn', fn: f[1], args: body || {} }); return json(f[1] === 'ingest-link' ? INGEST : {}); }
      return json([]);
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com/');
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.evaluate((o) => {
      (0, eval)('(' + o.seed + ')')();
      // After a send the app reloads from the database. This stub's database
      // is empty, so a real reload would wipe the screen: the reload is
      // counted instead, and the state stays what the database would return.
      (0, eval)('loadUserData = async function () { window.__reloads = (window.__reloads || 0) + 1; }');
      document.getElementById('login').style.display = 'none';
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      (0, eval)(o.go);
    }, { seed: seed.toString(), go: screen });
    await page.waitForTimeout(500);
    return { ctx, page, wire, errs };
  };
  const RECOMMEND = "AppState.queryMode='recommend'; AppState.queryItemId=null; showView('query',{circleId:'c1'})";
  const writes = (wire, table) => wire.filter((w) => w.kind === 'write' && w.table === table);
  const sends = (wire) => wire.filter((w) => w.kind === 'rpc' && w.fn === 'send_rec_to_member');
  // One scenario failing (on the old page a step can wait for ever) is
  // recorded and the next one still runs, so the control exercises them all.
  const section = async (fn) => { try { await fn(); } catch (e) { ck('scenario ran to the end', false, String(e && e.message || e).split(/\n/)[0]); } };
  const type = async (page, sel, text) => { if (!(await page.isVisible(sel))) return false; await page.click(sel); await page.keyboard.type(text, { delay: 5 }); await page.waitForTimeout(350); return true; };

  try {
    console.log('== 1. Recommend, something you have saved ==\n');
    await section(async () => {
      const { ctx, page, wire, errs } = await open(RECOMMEND);
      const ph = await page.getAttribute('#q-item-search', 'placeholder');
      ck('the box asks for a name or a link', /name or paste a link/i.test(ph || ''), ph);
      await type(page, '#q-item-search', 'Ar');
      const res = await page.evaluate(() => (document.getElementById('q-item-results') || {}).innerText || '');
      ck('what you have saved that matches is offered, as From Saved', /From Saved/i.test(res) && /Arte/.test(res), res.replace(/\n/g, ' | '));
      const row = await page.$('[data-action="q-pick-item"][data-rec-id="r2"]');
      if (row) await row.click();
      await page.waitForTimeout(200);
      const picked = await page.evaluate(() => (document.getElementById('q-item-picked') || {}).innerText || '');
      ck('picking it works as before', /Arte/.test(picked), picked);
      await page.click('#q-send', { timeout: 5000 });
      await page.waitForTimeout(1200);
      ck('Send sends that one', sends(wire).length > 0 && sends(wire).every((s) => s.args.p_rec_id === 'r2'), JSON.stringify(sends(wire).map((s) => s.args)));
      ck('...and writes nothing new to Saved', writes(wire, 'recommendations').length === 0 && writes(wire, 'canonicals').length === 0,
         JSON.stringify(wire.filter((w) => w.kind === 'write').map((w) => w.table)));
      ck('no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
    });

    console.log('\n== 2. Recommend, something new ==\n');
    await section(async () => {
      const { ctx, page, wire, errs } = await open(RECOMMEND);
      await type(page, '#q-item-search', 'Osteria degli Spiriti');
      const res = await page.evaluate(() => (document.getElementById('q-item-results') || {}).innerText || '');
      ck('it says it is not in Saved, and that sending saves it', /Not in Saved yet/.test(res) && /saves it too/.test(res), res);
      ck('...and asks where and why', await page.isVisible('#q-new-loc').catch(() => false) && await page.isVisible('#q-new-note').catch(() => false));
      if (await page.isVisible('#q-new-loc').catch(() => false)) { await page.fill('#q-new-loc', 'Lecce'); await page.fill('#q-new-note', 'The orecchiette, every time.'); }
      await page.click('#q-send', { timeout: 5000 });
      await page.waitForTimeout(1500);
      const can = writes(wire, 'canonicals').map((w) => w.rows).flat().find((r) => r.name === 'Osteria degli Spiriti');
      const rec = writes(wire, 'recommendations').map((w) => w.rows).flat().find((r) => can && r.canonical_id === can.id);
      ck('it is saved: the thing itself, where it is', !!can && can.location === 'Lecce', JSON.stringify(can));
      ck('...and your Saved entry, with your note, in this circle', !!rec && rec.note === 'The orecchiette, every time.' && rec.circle_id === 'c1', JSON.stringify(rec));
      const iRec = wire.findIndex((w) => w.kind === 'write' && w.table === 'recommendations');
      const iSend = wire.findIndex((w) => w.kind === 'rpc' && w.fn === 'send_rec_to_member');
      ck('...BEFORE it is sent', iRec > -1 && iSend > iRec, 'saved@' + iRec + ' sent@' + iSend);
      ck('it is sent as that saved entry', !!rec && sends(wire).length > 0 && sends(wire).every((s) => s.args.p_rec_id === rec.id), JSON.stringify(sends(wire).map((s) => s.args)));
      const state = await page.evaluate(() => ({ picked: (document.getElementById('q-item-picked') || {}).innerText || '', box: document.getElementById('q-item-search').value, n: AppState.userRecs.length }));
      ck('the screen now shows it as picked, and it is in Saved', /Osteria degli Spiriti/.test(state.picked) && state.box === '' && state.n === 3, JSON.stringify(state));
      const before = writes(wire, 'recommendations').map((w) => w.rows).flat().map((r) => r.id);
      // Everyone it reached is unticked after a send, so Send is disabled -
      // tick them again to press it a second time.
      ck('after sending, the people it reached are unticked', await page.isDisabled('#q-send'));
      await page.click('[data-action="q-who-all"]', { timeout: 5000 });
      await page.waitForTimeout(200);
      await page.click('#q-send', { timeout: 5000 });
      await page.waitForTimeout(1200);
      const ids = new Set(writes(wire, 'recommendations').map((w) => w.rows).flat().map((r) => r.id));
      ck('a second press does not save a second copy', ids.size === new Set(before).size && (await page.evaluate(() => AppState.userRecs.length)) === 3, JSON.stringify([...ids]));
      ck('no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
    });
    {
      const { ctx, page, wire } = await open(RECOMMEND);
      await type(page, '#q-item-search', 'arte');
      await page.click('#q-send', { timeout: 5000 });
      await page.waitForTimeout(1300);
      ck('typing the name of something saved sends THAT one, no copy',
         writes(wire, 'canonicals').length === 0 && sends(wire).length > 0 && sends(wire).every((s) => s.args.p_rec_id === 'r2'),
         JSON.stringify({ cans: writes(wire, 'canonicals').length, sends: sends(wire).map((s) => s.args.p_rec_id) }));
      await ctx.close();
    }

    console.log('\n== 3. Recommend, a pasted link ==\n');
    await section(async () => {
      const { ctx, page, wire } = await open(RECOMMEND);
      await page.evaluate(() => {
        const el = document.getElementById('q-item-search');
        if (!el) return;
        el.focus(); el.value = 'https://www.osteriadeglispiriti.it/';
        el.dispatchEvent(new Event('paste', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(1500);
      const reads = wire.filter((w) => w.kind === 'fn' && w.fn === 'ingest-link');
      const s = await page.evaluate(() => ({ box: (document.getElementById('q-item-search') || {}).value, loc: (document.getElementById('q-new-loc') || {}).value, msg: (document.getElementById('q-item-link') || {}).innerText }));
      ck('the link is read - once', reads.length === 1 && reads[0].args.url === 'https://www.osteriadeglispiriti.it/', JSON.stringify(reads));
      ck('...its name goes in the box, and where it is', s.box === 'Osteria degli Spiriti' && s.loc === 'Lecce', JSON.stringify(s));
      ck('...and it says so', /Got it/.test(s.msg || ''), s.msg);
      if (await page.isVisible('#q-send')) { await page.click('#q-send', { timeout: 5000 }); await page.waitForTimeout(1500); }
      const can = writes(wire, 'canonicals').map((w) => w.rows).flat().find((r) => r.name === 'Osteria degli Spiriti');
      ck('sending saves it with the link it came from', !!can && can.website_url === 'https://www.osteriadeglispiriti.it/', JSON.stringify(can));
      await ctx.close();
    });

    console.log('\n== 4. The Save sheet ==\n');
    await section(async () => {
      const { ctx, page, wire, errs } = await open("showView('library'); openModal('add-rec')");
      const btns = await page.evaluate(() => [].map.call(document.querySelectorAll('.modal button'), (b) => b.innerText.trim()));
      ck('no Fetch button', btns.indexOf('Fetch') < 0, JSON.stringify(btns));
      await page.evaluate(() => {
        const el = document.getElementById('ar-url');
        el.focus(); el.value = 'https://www.osteriadeglispiriti.it/';
        el.dispatchEvent(new Event('paste', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(1500);
      const reads = wire.filter((w) => w.kind === 'fn' && w.fn === 'ingest-link');
      const s = await page.evaluate(() => ({ name: document.getElementById('ar-name').value, loc: document.getElementById('ar-location').value, msg: ((document.getElementById('ar-url-msg') || {}).innerText || '') }));
      ck('a pasted link is read - once - and fills the sheet', reads.length === 1 && s.name === 'Osteria degli Spiriti' && s.loc === 'Lecce', JSON.stringify({ reads: reads.length, s }));
      ck('...and it says so', /Got it/.test(s.msg), s.msg);
      await page.click('#ar-save');
      await page.waitForTimeout(1300);
      const can = writes(wire, 'canonicals').map((w) => w.rows).flat().find((r) => r.name === 'Osteria degli Spiriti');
      const rec = writes(wire, 'recommendations').map((w) => w.rows).flat().find((r) => can && r.canonical_id === can.id);
      ck('Save still saves, with the link', !!can && !!rec && can.website_url === 'https://www.osteriadeglispiriti.it/', JSON.stringify({ can, rec }).slice(0, 200));
      ck('no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
    });
    {
      const { ctx, page, wire } = await open("showView('library'); openModal('add-rec')");
      await page.fill('#ar-name', 'Bar Shpagat');
      await page.click('.ar-circle-opt[data-circle-id="c1"]');
      await page.check('#ar-send');
      await page.waitForTimeout(300);
      await page.click('#ar-save');
      await page.waitForTimeout(1500);
      const can = writes(wire, 'canonicals').map((w) => w.rows).flat().find((r) => r.name === 'Bar Shpagat');
      const rec = writes(wire, 'recommendations').map((w) => w.rows).flat().find((r) => can && r.canonical_id === can.id);
      const iRec = wire.findIndex((w) => w.kind === 'write' && w.table === 'recommendations');
      const iSend = wire.findIndex((w) => w.kind === 'rpc' && w.fn === 'send_rec_to_member');
      ck('Save and send still saves, then sends that one', !!rec && iSend > iRec && sends(wire).every((x) => x.args.p_rec_id === rec.id), 'saved@' + iRec + ' sent@' + iSend);
      await ctx.close();
    }
    await section(async () => {
      const { ctx, page } = await open("showView('home'); openModal('fab-menu')");
      const t = await page.evaluate(() => (document.querySelector('.modal [data-action=fab-recommend]') || {}).innerText || '');
      ck('the + sheet says Recommend takes either', /Something new, or from Saved/.test(t), t.replace(/\n/g, ' | '));
      await ctx.close();
    });

    console.log('\n== 5. One way to save (source, comments taken out) ==\n');
    const code = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const body = (name) => { const i = code.indexOf('async function ' + name + '('); if (i < 0) return ''; const j = code.indexOf('\n}\n', i); return code.slice(i, j); };
    ck('a new saved item is built in exactly one place', (code.match(/const newRec = \{ id: uid\(\)/g) || []).length === 1, (code.match(/const newRec = \{ id: uid\(\)/g) || []).length);
    ck('...inside saveRecommendation', /const newRec = \{ id: uid\(\)/.test(body('saveRecommendation')));
    ck('the Save sheet goes through it', /saveRecommendation\(/.test(body('handleSaveRec')));
    ck('Recommend goes through it', /saveRecommendation\(/.test(body('handleSendRecFromCircle')));
  } catch (e) {
    fail++; console.log('  FAIL  threw: ' + String(e && e.message || e).split('\n')[0]);
  } finally { await browser.close(); }

  console.log('\n  ' + (OLD ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
