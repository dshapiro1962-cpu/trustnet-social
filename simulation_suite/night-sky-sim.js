// night-sky-sim.js - step 4 of 4 of the visual redesign (v0.103.0 / respond
// r2.9). dan, 2 Nov: "lets go to 4".
//
//   - Sign in opens on the NIGHT SKY: your circle as a ring of friends among
//     the stars, the name and what Trustnet is for in white over it, and the
//     sign-in itself on a sheet below - the same email box, Continue with
//     email first, Continue with WhatsApp second, all on one screen
//   - the answer page wears the same sky, with the question in it, large and
//     white; while the page loads or says something went wrong, the sky holds
//     just the name
//
// Drawn in Chrome at 390x844, by day and by night, and at computer width.
// The sky is decoration only (aria-hidden): what is read is checked as text.
//
//   node night-sky-sim.js        -> must PASS
//   node night-sky-sim.js --old  -> pre-step4/, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const pageFile = (name) => OLD && fs.existsSync(path.join(__dirname, 'pre-step4', name)) ? path.join(__dirname, 'pre-step4', name) : path.join(REPO, 'web', name);
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 300) : '')); }
};

(async () => {
  console.log('\n   fixture: ' + (OLD ? 'pre-step4/  (must FAIL)' : 'web/') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const open = async (url, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, isMobile: !opts.viewport, hasTouch: !opts.viewport, colorScheme: opts.scheme || 'light' });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      const name = p === '/' ? 'index.html' : p.replace(/^\//, '');
      if (name === 'version.json') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: (fs.readFileSync(pageFile('index.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1] || '' }) });
      const f = pageFile(name);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: /\.html$/.test(f) ? 'text/html; charset=utf-8' : undefined, body: fs.readFileSync(f) });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const p = new URL(req.url()).pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      if (p === '/functions/v1/response-meta') return json({ requester_name: 'Tom', circle_name: 'Travel', query_text: 'Where do we eat in Lecce on a Sunday?' });
      if (p.indexOf('/rest/v1/') === 0 && p.indexOf('/rpc/') < 0) return json([]);
      return json({});
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.goto('https://trustnetsocial.com' + url);
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    return { ctx, page, errs };
  };
  const tok = "function tok(n) { var p = document.createElement('div'); p.style.background = 'var(' + n + ')'; document.body.appendChild(p); var v = getComputedStyle(p).backgroundColor; p.remove(); return v; }";

  try {
    for (const scheme of ['light', 'dark']) {
      const when = scheme === 'light' ? 'day' : 'night';
      console.log('\n== Sign in (' + when + ') ==\n');
      const { ctx, page, errs } = await open('/', { scheme });
      const S = await page.evaluate((T) => {
        (0, eval)(T);
        const L = document.getElementById('login');
        const sky = L.querySelector('.tn-sky'), words = L.querySelector('.tn-sky-words'), card = L.querySelector('.tn-login-card');
        const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
        const vis = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
        const em = document.getElementById('login-email'), send = document.getElementById('login-send'), wa = document.getElementById('login-wa-go');
        return { shown: getComputedStyle(L).display, bg: getComputedStyle(L).backgroundColor, night: tok('--night'), white: (function () { const p = document.createElement('div'); p.style.color = 'var(--on-night)'; document.body.appendChild(p); const v = getComputedStyle(p).color; p.remove(); return v; })(),
          sky: !!(sky && sky.querySelector('svg') && sky.getAttribute('aria-hidden') === 'true'),
          words: words ? words.innerText.replace(/\s+/g, ' ').trim() : '', wordColour: words ? getComputedStyle(words.querySelector('.tn-sky-line') || words).color : '',
          wordsBox: words ? r(words) : null, card: card ? r(card) : null, cardBg: card ? getComputedStyle(card).backgroundColor : '', surface: tok('--surface'),
          cardRadius: card ? parseFloat(getComputedStyle(card).borderTopLeftRadius) : 0,
          order: [em, send, wa].every(Boolean) ? [r(em).top, r(send).top, r(wa).top] : null, primary: send ? send.classList.contains('btn-primary') : false,
          heading: vis(L.querySelector('.tn-login-h')) ? L.querySelector('.tn-login-h').innerText : '',
          subShown: vis(L.querySelector('.tn-login-card .tn-login-sub')),
          inCard: !!(card && card.contains(em) && card.contains(send) && card.contains(wa)), lowest: Math.round(Math.max.apply(null, [].map.call(L.querySelectorAll('button, input, a, p'), (e) => vis(e) ? e.getBoundingClientRect().bottom : 0))) };
      }, tok);
      ck('sign in opens on the night sky', S.shown === 'flex' && S.bg === S.night, S.bg + ' want ' + S.night);
      ck('...with your circle drawn in it, as decoration only', S.sky);
      ck('...the name and what Trustnet is for, in white over it', /^trustnet Recommendations from the people you trust\.$/.test(S.words) && S.wordColour === S.white, S.words + ' / ' + S.wordColour);
      ck('...and the sign-in on a sheet below the words', S.card && S.wordsBox && S.card.top >= S.wordsBox.bottom - 1 && S.cardBg === S.surface && S.cardRadius >= 28, JSON.stringify({ card: S.card, words: S.wordsBox, radius: S.cardRadius }));
      ck('the sheet holds the email box, then Continue with email (the one green), then WhatsApp', S.inCard && S.order && S.order[0] < S.order[1] && S.order[1] < S.order[2] && S.primary, JSON.stringify(S.order));
      ck('...under a "Sign in" heading, with the line not said twice', S.heading === 'Sign in' && /Recommendations from the people you trust\./.test(S.words) && !S.subShown, JSON.stringify({ h: S.heading, sub: S.subShown, words: S.words }));
      ck('...and all of it on screen without scrolling', S.lowest <= 844, S.lowest);
      if (errs.length) ck('sign in draws without an error', false, errs.join(' | '));
      await ctx.close();

      console.log('\n== the answer page (' + when + ') ==\n');
      const A = await open('/respond.html?t=tok1', { scheme });
      const R = await A.page.evaluate((T) => {
        (0, eval)(T);
        const hero = document.querySelector('.hero'), ask = document.querySelector('.ask'), at = document.getElementById('ask-text');
        return { heroBg: hero ? getComputedStyle(hero).backgroundColor : '', askBg: ask ? getComputedStyle(ask).backgroundColor : '', night: tok('--night'),
          svg: !!(hero && hero.querySelector('svg[aria-hidden="true"]')),
          touch: hero && ask ? Math.abs(ask.getBoundingClientRect().top - hero.getBoundingClientRect().bottom) : 99,
          q: at ? at.innerText : '', size: at ? parseFloat(getComputedStyle(at).fontSize) : 0, weight: at ? parseInt(getComputedStyle(at).fontWeight, 10) : 0,
          colour: at ? getComputedStyle(at).color : '', white: (function () { const p = document.createElement('div'); p.style.color = 'var(--on-night)'; document.body.appendChild(p); const v = getComputedStyle(p).color; p.remove(); return v; })(),
          who: (document.getElementById('ask-from') || {}).innerText || '', stamp: (document.body.innerText.match(/\br\d+\.\d+\b/) || [''])[0] };
      }, tok);
      ck('the answer page opens on the same night sky', R.heroBg === R.night && R.svg, R.heroBg + ' svg ' + R.svg);
      ck('...and the question is IN the sky, continuing it down', R.askBg === R.night && R.touch <= 1, JSON.stringify({ ask: R.askBg, gap: R.touch }));
      ck('...large and white', /Where do we eat in Lecce on a Sunday\?/.test(R.q) && R.size >= 22 && R.weight >= 700 && R.colour === R.white, JSON.stringify({ size: R.size, w: R.weight, c: R.colour }));
      ck('...under who is asking', /^Tom is asking their Travel circle$/.test(R.who), R.who);
      ck('...and the page says it is r2.9', R.stamp === 'r2.9', R.stamp);
      if (A.errs.length) ck('the answer page draws without an error', false, A.errs.join(' | '));
      await A.ctx.close();
    }

    console.log('\n== while the answer page has nothing to show ==\n');
    {
      const E = await open('/respond.html');
      const r = await E.page.evaluate(() => { const ask = document.querySelector('.ask'); return { askShown: !!(ask && ask.getBoundingClientRect().height > 0), hero: !!document.querySelector('.hero svg'), text: (document.querySelector('.hero') || {}).innerText || '' }; });
      ck('a link without its pass shows the sky with just the name, no empty question', r.hero && !r.askShown && r.text.trim() === 'Trustnet', JSON.stringify(r));
      await E.ctx.close();
    }

    console.log('\n== on a computer ==\n');
    {
      const D = await open('/', { viewport: { width: 1280, height: 860 } });
      const r = await D.page.evaluate(() => { const c = document.querySelector('#login .tn-login-card'); if (!c) return null; const b = c.getBoundingClientRect(); return { w: Math.round(b.width), mid: Math.round((b.left + b.right) / 2), bottom: Math.round(b.bottom) }; });
      ck('on a computer the sheet sits centred at the foot of the sky', r && r.w <= 440 && Math.abs(r.mid - 640) < 3 && r.bottom >= 858, JSON.stringify(r));
      await D.ctx.close();
    }
  } catch (e) {
    ck('the run finished', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e);
  } finally {
    await browser.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
