// saved-words-sim.js - Release 1 of the October overhaul (v0.99.13 / respond
// r2.8): the words dan marked on the screen map, 13-15 Oct.
//
//   - "Library" is "Saved", on every screen a person can reach, on the answer
//     page, the shared-list page, the legal pages, the connector page, the film
//     (English and Hebrew), and in the messages the server sends
//   - no "No password, no code to type" on Sign in
//   - no doctors, dentists or plumbers in the examples
//   - "Domain" is "Topic"; "Why do you trust them?" is "Notes"
//   - the + sheet's first choice is "Save recommendation", with no second line
//   - the old Share list sheet is gone: its link (trustnet.com/u/...) never
//     existed and its Copy button copied nothing
//   - the answer page has no Fetch button: a pasted link fills the form, and
//     the share box says in plain words what it does, naming who asked
//
// EVERYTHING ON A SCREEN IS READ FROM THE SCREEN. The app is drawn in real
// Chrome at 390x844 against a stubbed Supabase, and the words are what
// innerText and the placeholders say - so a comment that quotes an old word
// cannot fail it, and a word moved into a render function cannot hide from it.
//
//   node saved-words-sim.js        -> must PASS
//   node saved-words-sim.js --old  -> pre-v0.99.13/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const BASE = path.join(__dirname, 'pre-v0.99.13');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

// A page from the fixture set when it has one, from web/ otherwise.
const pageFile = (p) => {
  const name = p.replace(/^\//, '') || 'index.html';
  if (OLD && fs.existsSync(path.join(BASE, name))) return path.join(BASE, name);
  return path.join(REPO, 'web', name);
};
const fnFile = (fn) => OLD ? path.join(BASE, 'fn', fn + '.ts') : path.join(REPO, 'supabase', 'functions', fn, 'index.ts');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 220) : '')); }
};
const LIB = /librar/i;
const MEDIC = /doctor|dentist|plumber|cardiolog|\bDr\./i;

// The data a signed-in screen is drawn against.
function seed(kind) {
  var now = Date.now(), d = 864e5, iso = function (t) { return new Date(t).toISOString(); };
  AppState.isDemoMode = false;
  AppState.userProfile = { id: 'u0', name: 'Dan Shapiro', avatar: 'DS', avatarColor: '#1D5A45', bio: '', location: 'Tel Aviv', shareByDefault: true, email: 'dan@example.com', joinedDate: iso(now - 60 * d) };
  AppState._feedFetched = true; AppState._notifFetched = true; AppState._notifSeeded = true; AppState._answeredFetched = true;
  AppState._tmFetched = true; AppState._tmData = []; AppState._answered = []; AppState._feed = [];
  AppState.userCollections = []; AppState.people = []; AppState.circleInterests = [];
  AppState.userCircles = [{ id: 'c1', ownerId: 'me', name: 'Travel', domain: 'travel', description: '', color: '#2C5877', location: '', isOwn: true, createdAt: iso(now - 90 * d), memberIds: ['m1', 'm2'] }];
  AppState.userMembers = [
    { id: 'm1', circleId: 'c1', name: 'Tom Shapiro', avatar: 'TS', avatarColor: '#3F6C8A', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000001', responseRate: 'unknown', isExternalSource: false, linkedUserId: 'u1', personId: 'p1', addedAt: iso(now - 9 * d) },
    { id: 'm2', circleId: 'c1', name: 'May Shapiro', avatar: 'MS', avatarColor: '#7B5D98', trustBasis: '', contactMethod: 'whatsapp', contactValue: '+972500000003', responseRate: 'unknown', isExternalSource: false, linkedUserId: null, personId: 'p2', addedAt: iso(now - 9 * d) }];
  AppState.userCanonicals = [
    { id: 'k1', type: 'place', name: 'Masseria Moroseta', category: '', kind: 'hotel', location: 'Ostuni, Puglia', description: '', imageEmoji: '', primaryCategory: 'travel', aiTags: [], imageUrl: '', hasSearchDoc: true },
    { id: 'k2', type: 'place', name: 'Arte', category: '', kind: 'restaurant', location: 'Lecce', description: '', imageEmoji: '', primaryCategory: 'dining', aiTags: [], imageUrl: '', hasSearchDoc: true }];
  AppState.userRecs = [
    { id: 'r1', canonicalId: 'k1', circleId: 'c1', recommendedBy: 'm1', note: 'Book the room with the terrace.', rating: 0, tags: [], status: 'saved', date: iso(now - d), addedAt: iso(now - d), category: '' },
    { id: 'r2', canonicalId: 'k2', circleId: 'c1', recommendedBy: 'm2', note: '', rating: 0, tags: [], status: 'saved', date: iso(now - 2 * d), addedAt: iso(now - 2 * d), category: '' }];
  var resp = function (id, mid, name, saved) { return { id: id, contactId: mid, isAnonymous: false, degree: 1, recName: name, recNote: '', recLoc: '', recEmoji: '', savedToLibrary: saved, respondedAt: iso(now - d) }; };
  AppState.userQueries = [{ id: 'q1', circleId: 'c1', text: 'Hotels in Apulia?', degree: 1, status: 'sent', sentAt: iso(now - 3 * d), resolvedAt: null, chosenResponseId: null,
    responses: [resp('x1', 'm1', 'Masseria Moroseta', true), resp('x2', 'm2', 'Borgo Egnazia', false)] }];
  AppState._notifications = [{ id: 'n1', type: 'query', title: 'Tom is asking for a recommendation', body: 'Where do we eat in Lecce on a Sunday?', circle_id: null, actor_name: 'Tom', created_at: iso(now - d / 2), response_token: 'tok1', query_id: 'zz', link_url: null, handled_at: null }];
  AppState.suggestions = [{ id: 's1', canonical_id: 'ks1', from_person_id: null, from_user_id: 'u3', from_name: 'May', via: 'saved', source_note: '', query_text: '', matched_circles: ['c1'], matched_interest: 'restaurant', status: 'pending',
    canonicals: { id: 'ks1', name: 'Trattoria Nonna Nietta', kind: 'restaurant', location: 'Ostuni', primary_category: 'dining', category: '' } }];
  if (kind === 'empty') { AppState.userRecs = []; AppState.userCanonicals = []; }
}
// What a person reads: the open sheet if there is one, else the screen, plus
// every placeholder and button label on it.
function readScreen() {
  var vis = function (el) { if (!el) return false; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var mr = document.getElementById('modal-root'), login = document.getElementById('login'), app = document.getElementById('app');
  var roots = (mr && mr.children.length) ? [mr] : (login && vis(login) ? [login] : (app && vis(app) ? [document.querySelector('#main .topbar'), document.getElementById('view-body'), document.getElementById('mobile-tabbar')] : [document.body]));
  roots = roots.filter(Boolean);
  var text = roots.map(function (r) { return r.innerText || ''; }).join('\n');
  var hints = [];
  roots.forEach(function (r) { r.querySelectorAll('input, textarea').forEach(function (f) { if (vis(f) && f.placeholder) hints.push(f.placeholder); }); });
  return { text: text, hints: hints.join(' | ') };
}

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-v0.99.13/  (must FAIL)' : 'web/') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const calls = [];
  const context = async (stub) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript({ content: 'try{Object.defineProperty(navigator,"standalone",{get:function(){return true;}});}catch(e){}window.open=function(){return null;};' });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      const f = pageFile(p === '/' ? '/index.html' : p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      const fnm = p.match(/^\/functions\/v1\/([^/?]+)/);
      if (fnm) { calls.push({ fn: fnm[1], body: req.postData() || '' }); const o = stub && stub[fnm[1]]; return json(o !== undefined ? o : {}); }
      if (p.indexOf('/rest/v1/rpc/') === 0) return json(null);
      if (p.indexOf('/rest/v1/') === 0) return json([]);
      return json({});
    });
    return ctx;
  };
  const settle = (page) => page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});

  try {
    // ── 1 · the app, screen by screen ────────────────────────────────────────
    console.log('== 1. the app, drawn at phone width ==\n');
    const SCREENS = [
      ['Sign in', null, null],
      ['Home', 'full', "showView('home')"],
      ['Saved', 'full', "showView('library')"],
      ['Saved, empty', 'empty', "showView('library')"],
      ['An item', 'full', "showView('rec-detail',{recId:'r1'})"],
      ['Inbox', 'full', "showView('inbox')"],
      ['Inbox, answers', 'full', "showView('inbox'); var b=document.querySelector('[data-action=inbox-filter][data-filter=answers]'); if(b) b.click();"],
      ['A question', 'full', "showView('history-detail',{queryId:'q1'})"],
      ['Ask', 'full', "AppState.queryMode='ask'; showView('query',{circleId:'c1'})"],
      ['Recommend', 'full', "AppState.queryMode='recommend'; showView('query',{circleId:'c1'})"],
      ['Circles, none yet', 'empty', "AppState.userCircles=[]; AppState.userMembers=[]; showView('circles')"],
      ['The + sheet', 'full', "showView('home'); openModal('fab-menu')"],
      ['Save sheet', 'full', "showView('library'); openModal('add-rec')"],
      ['New circle', 'full', "showView('circles'); openModal('add-circle')"],
      ['Edit circle', 'full', "showView('circle-detail',{circleId:'c1'}); openModal('edit-circle',{circleId:'c1'})"],
      ['Circle options', 'full', "showView('circle-detail',{circleId:'c1'}); openModal('circle-more',{circleId:'c1'})"],
      ['Add friends, someone new', 'full', "showView('circle-detail',{circleId:'c1'}); openModal('add-member',{circleId:'c1'}); var b=document.querySelector('[data-action=add-new-person]'); if(b) b.click();"],
      ['Keep a suggestion', 'full', "showView('inbox'); openModal('file-suggestion',{sgId:'s1'})"],
      ['New list', 'full', "showView('library'); openModal('collection-create')"],
      ['Settings', 'full', "showView('settings')"],
    ];
    const R = {};
    for (const [name, kind, go] of SCREENS) {
      const ctx = await context();
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e.message || e)));
      await page.goto('https://trustnetsocial.com/');
      await settle(page);
      await page.waitForTimeout(300);
      if (kind) {
        await page.evaluate((o) => {
          (0, eval)('(' + o.seed + ')')(o.kind);
          document.getElementById('login').style.display = 'none';
          document.getElementById('onboarding').style.display = 'none';
          document.getElementById('app').style.display = 'flex';
          (0, eval)(o.go);
        }, { seed: seed.toString(), kind, go });
        await page.waitForTimeout(500);
      }
      R[name] = await page.evaluate(readScreen);
      R[name].errs = errs;
      // A tab's label is its last line: the Inbox tab carries a count above it.
      R[name].tabs = await page.evaluate(() => [].map.call(document.querySelectorAll('#mobile-tabbar .mtab'), (t) => t.innerText.trim().split(/\s*\n\s*/).pop()));
      R[name].title = await page.evaluate(() => (document.getElementById('topbar-title') || {}).innerText || '');
      R[name].fab = await page.evaluate(() => [].map.call(document.querySelectorAll('.modal [data-action=fab-save]'), (b) => b.innerText.replace(/\s+/g, ' ').trim()));
      if (name === 'Home') {
        R.shareList = await page.evaluate(() => {
          openModal('share-list');
          const opened = document.getElementById('modal-root').innerHTML.length > 0;
          closeModal();
          return { opened, fn: typeof modalShareList === 'function',
            doors: document.querySelectorAll('[data-action=open-share-list],[data-action=copy-share-link]').length };
        });
      }
      await ctx.close();
    }
    for (const [name] of SCREENS) {
      const r = R[name];
      const where = r.text.split('\n').filter((l) => LIB.test(l)).concat(LIB.test(r.hints) ? ['hint: ' + r.hints] : []);
      ck(name + ': no "library" anywhere on it', !where.length, where.join(' / '));
      if (r.errs.length) ck(name + ': draws without an error', false, r.errs.join(' | '));
    }
    ck('the tab bar says Saved', JSON.stringify(R.Home.tabs) === JSON.stringify(['Home', 'Circles', 'Inbox', 'Saved']), JSON.stringify(R.Home.tabs));
    ck('...and the screen it opens is called Saved', R.Saved.title.trim() === 'Saved', R.Saved.title);
    ck('an item\'s way back says Saved', /Saved/.test(R['An item'].title), R['An item'].title);
    const medic = SCREENS.map(([n]) => n).filter((n) => MEDIC.test(R[n].text) || MEDIC.test(R[n].hints));
    ck('no doctor, dentist or plumber in any example', !medic.length, medic.map((n) => n + ': ' + (R[n].hints.match(/[^|]*(doctor|dentist|plumber|cardiolog|Dr\.)[^|]*/i) || R[n].text.match(/.*(doctor|dentist|plumber|cardiolog|Dr\.).*/i) || [''])[0]).join(' / '));
    ck('Sign in has no "No password, no code"', !/no password|no code/i.test(R['Sign in'].text), (R['Sign in'].text.match(/.*no password.*/i) || [''])[0]);
    ck('New circle asks for a Topic', /\bTOPIC\b/.test(R['New circle'].text) && !/DOMAIN/i.test(R['New circle'].text), R['New circle'].text.replace(/\n/g, ' | ').slice(0, 160));
    ck('Edit circle asks for a Topic', /\bTOPIC\b/.test(R['Edit circle'].text) && !/DOMAIN/i.test(R['Edit circle'].text));
    ck('adding someone asks for Notes, not "why do you trust them"', /\bNOTES\b/.test(R['Add friends, someone new'].text) && !/why do you trust/i.test(R['Add friends, someone new'].text),
       R['Add friends, someone new'].text.replace(/\n/g, ' | ').slice(0, 200));
    ck('the + sheet\'s first choice is just "Save recommendation"', JSON.stringify(R['The + sheet'].fab) === '["Save recommendation"]', JSON.stringify(R['The + sheet'].fab));
    ck('the old Share list sheet does not open', R.shareList && !R.shareList.opened, JSON.stringify(R.shareList));
    ck('...and nothing is left of it', R.shareList && !R.shareList.fn && R.shareList.doors === 0, JSON.stringify(R.shareList));

    // ── 2 · the answer page ──────────────────────────────────────────────────
    console.log('\n== 2. the answer page ==\n');
    const META = { requester_name: 'Tom', circle_name: 'Travel', query_text: 'Where do we eat in Lecce on a Sunday?' };
    const INGEST = { name: 'Osteria degli Spiriti', location: 'Lecce', note: '', needs_review: false };
    const ctx = await context({ 'response-meta': META, 'ingest-link': INGEST });
    const page = await ctx.newPage();
    await page.goto('https://trustnetsocial.com/respond.html?t=tok1');
    await page.waitForTimeout(1200);
    const r0 = await page.evaluate(readScreen);
    const btns = await page.evaluate(() => [].map.call(document.querySelectorAll('button'), (b) => b.offsetParent ? b.innerText.trim() : '').filter(Boolean));
    ck('no Fetch button', btns.indexOf('Fetch') < 0 && !(await page.$('#rec-url-btn')), JSON.stringify(btns));
    ck('no "library" on the answer page', !LIB.test(r0.text + r0.hints), (r0.text.match(/.*librar.*/i) || [''])[0]);
    ck('no doctor in its example', !MEDIC.test(r0.hints), r0.hints);
    ck('the share box names who asked', /Tom’s friends can see this too/.test(r0.text), (r0.text.match(/.*(friends|network).*/i) || [''])[0]);
    ck('...and says what it does and how to keep it to them', /suggest it to people in Tom’s circles/.test(r0.text) && /send it to Tom only/.test(r0.text),
       (r0.text.match(/.*(Lets people|suggest it).*/i) || [''])[0]);
    calls.length = 0;
    await page.focus('#rec-url');
    await page.evaluate(() => {
      const el = document.getElementById('rec-url');
      el.value = 'https://www.osteriadeglispiriti.it/';
      el.dispatchEvent(new Event('paste', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    const ingests = calls.filter((c) => c.fn === 'ingest-link');
    const filled = await page.evaluate(() => ({ name: document.getElementById('rec-name').value, loc: document.getElementById('rec-location').value, msg: document.getElementById('rec-url-msg').textContent }));
    ck('pasting a link reads it - once', ingests.length === 1, ingests.length + ' calls');
    ck('...with the link and this answer\'s token', ingests[0] && /osteriadeglispiriti/.test(ingests[0].body) && /"response_token":"tok1"/.test(ingests[0].body), ingests[0] && ingests[0].body);
    ck('...and fills the form', filled.name === 'Osteria degli Spiriti' && filled.loc === 'Lecce', JSON.stringify(filled));
    ck('...and says so', /Got it/.test(filled.msg), filled.msg);
    await page.evaluate(() => { document.getElementById('rec-url').dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(600);
    ck('leaving the box does not read the same link again', calls.filter((c) => c.fn === 'ingest-link').length === 1);
    const src = fs.readFileSync(pageFile('/respond.html'), 'utf8');
    // The "answer from what you saved" strip shows only to an answerer who is
    // signed in and has saved things, so the drawn page cannot see it: its
    // words are read from the file - markup text and strings, not the code's
    // own names, not comments, not the ?debug=1 log.
    const noComments = src.replace(/<!--[\s\S]*?-->/g, '');
    const markup = noComments.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    const scripts = (noComments.match(/<script[\s\S]*?<\/script>/g) || []).join('\n')
      .split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l) && !/dbg\(/.test(l)).join('\n');
    const shown = (markup.match(/>[^<>]*</g) || []).concat(scripts.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) || [])
      .filter((s) => LIB.test(s) && !/^["'][A-Za-z_]+["']$/.test(s));
    ck('the answer page, signed in or not: no "library"', !shown.length, shown.join(' / ').slice(0, 200));
    const stamp = (src.match(/margin-top:10px;">(r[0-9.]+)<\/div>/) || [])[1];
    ck('the stamp moved to r2.8 and matches RESPOND_VERSION', stamp === 'r2.8' && src.indexOf('const RESPOND_VERSION = "r2.8"') > -1, stamp);
    await ctx.close();

    // ── 3 · the other pages ──────────────────────────────────────────────────
    console.log('\n== 3. the pages outside the app ==\n');
    const COLL = { title: 'Puglia, the short list', curator: 'Dan', count: 1, owner_id: 'other', items: [{ name: 'Arte', location: 'Lecce', category: 'Restaurant', note: '' }] };
    // connect.html shows its list only to someone signed in, and collection.html
    // its "added, credited to" line only to a signed-in viewer - a stubbed
    // visitor sees neither, so drawn text alone passed against the old pages.
    // Those two are read from the file, comments taken out.
    for (const p of ['/connect.html', '/collection.html']) {
      const words = fs.readFileSync(pageFile(p), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
      ck(p + ' (all of it, signed in or not): no "library"', !LIB.test(words), (words.match(/.*librar.*/i) || [''])[0].trim().slice(0, 140));
    }
    for (const [p, stub] of [['/privacy.html'], ['/terms.html'], ['/support.html'], ['/connect.html'], ['/collection.html?t=c1', { 'get-collection': COLL }]]) {
      const c = await context(stub);
      const pg = await c.newPage();
      await pg.goto('https://trustnetsocial.com' + p);
      await pg.waitForTimeout(900);
      // "open-source libraries" on the privacy page is code, not a place.
      const t = (await pg.evaluate(() => document.body.innerText)).replace(/open-source librar(y|ies)/gi, '');
      ck(p.split('?')[0] + ': no "library"', !LIB.test(t), (t.match(/.*librar.*/i) || [''])[0].trim());
      await c.close();
    }
    const film = fs.readFileSync(pageFile('/film.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const filmText = film.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    ck('the film: no "library" in its English', !/librar/i.test(filmText), (filmText.match(/.*librar.*/i) || [''])[0].trim().slice(0, 140));
    ck('the film: no "ספרייה" (library) in its Hebrew', !/ספרייה/.test(filmText));

    // ── 4 · what the server says ─────────────────────────────────────────────
    console.log('\n== 4. messages the server sends ==\n');
    const code = (fn) => fs.readFileSync(fnFile(fn), 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const strings = (s) => (s.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || []);
    for (const fn of ['save-collection', 'send-collection', 'whatsapp-webhook']) {
      const hits = strings(code(fn)).filter((s) => /librar/i.test(s) && !/^["'`](library|search_library)["'`]$/.test(s));
      ck(fn + ': no "library" in anything it says', !hits.length, hits.join(' / '));
    }
    ck('the save-by-WhatsApp reply says Saved', /"✓ Saved: "/.test(code('whatsapp-webhook')));
  } catch (e) {
    fail++; console.log('  FAIL  threw: ' + String(e && e.message || e).split('\n')[0]);
  } finally { await browser.close(); }

  console.log('\n  ' + (OLD ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
