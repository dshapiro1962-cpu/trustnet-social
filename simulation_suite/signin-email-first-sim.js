// signin-email-first-sim.js - Release 2 of the October overhaul (v0.99.15).
//
// dan, 13 Oct, on Sign in and the invitation screens: "continue with email
// should be the main option the writing in the green batton. 'continue with
// WhatsApp' should replace 'use email instead' with the instructions bellow",
// and on the circle invitation: "add continue with email as the main option,
// continue with WhatsApp secondery". And 15 Oct: email is only how you sign
// in - everything that reaches a person afterwards still travels on WhatsApp.
//
// What must be true, on every signed-out screen that offers a sign-in:
//   - the one green button is Continue with email, its box already showing
//   - Continue with WhatsApp is second, with its instructions under it
//   - "Use email instead" and "No code to type" are gone
//   - all of it on screen without scrolling, at 390x844
// And what must NOT change: on a circle invitation BOTH ways in still join
// that circle - WhatsApp through mint_join_token (never a plain sign-in), and
// email by carrying the invitation in the sign-in link. Your own invitation
// (the three steps, 0059) keeps its name, location and Sign in, nothing else.
//
// The REAL page in Chrome at 390x844, Supabase stubbed and every call recorded.
//
//   node signin-email-first-sim.js        -> must PASS
//   node signin-email-first-sim.js --old  -> pre-v0.99.15/index.html, must FAIL
//
// Needs Chrome and e2e/node_modules/playwright. Skips cleanly (exit 2) without.

const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');
const OLD = process.argv.indexOf('--old') > -1;
const INDEX = OLD ? path.join(__dirname, 'pre-v0.99.15', 'index.html') : path.join(REPO, 'web', 'index.html');
let playwright = null;
try { playwright = require(path.join(REPO, 'e2e', 'node_modules', 'playwright')); } catch (e) {}
if (!playwright) { console.log('no Playwright - skipping.'); process.exit(2); }

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(x).slice(0, 220) : '')); }
};

// Everything a person can see and press on the signed-out screen.
function look() {
  var vis = function (el) { if (!el) return false; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var lg = document.getElementById('login');
  var btns = [].filter.call(lg.querySelectorAll('button'), vis).map(function (b) {
    var r = b.getBoundingClientRect();
    return { t: b.innerText.trim(), primary: b.classList.contains('btn-primary'), action: b.dataset.action || '', top: r.top, bottom: r.bottom };
  });
  var email = document.getElementById('login-email');
  var er = email && vis(email) ? email.getBoundingClientRect() : null;
  var how = [].filter.call(lg.querySelectorAll('p'), function (p) { return vis(p) && /WhatsApp opens with a message ready/.test(p.innerText); })[0];
  var hr = how ? how.getBoundingClientRect() : null;
  var all = [].filter.call(lg.querySelectorAll('*'), vis).map(function (e) { return e.getBoundingClientRect(); });
  return { text: lg.innerText, btns: btns, email: er ? { top: er.top, bottom: er.bottom } : null, how: hr ? { top: hr.top, bottom: hr.bottom } : null,
    lowest: Math.max.apply(null, all.map(function (r) { return r.bottom; }).concat([0])), wide: document.documentElement.scrollWidth - innerWidth,
    heading: vis(lg.querySelector('.tn-login-h')) };
}

(async () => {
  console.log('\n   fixture: ' + path.basename(path.dirname(INDEX)) + '/index.html' + (OLD ? '   (must FAIL)' : '') + '\n');
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
  const open = async (url, rpc, fn) => {
    const rec = { rpc: [], otp: [], opened: [] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1' });
    await ctx.exposeBinding('__opened', (src, u) => { rec.opened.push(decodeURIComponent(u)); });
    await ctx.addInitScript({ content: 'window.open=function(u){window.__opened(String(u));return null;};' });
    await ctx.route('https://trustnetsocial.com/**', (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/' || p === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(INDEX) });
      const f = path.join(REPO, 'web', decodeURIComponent(p));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: '' });
    });
    await ctx.route('https://kgsdtfrcyjrxeyqqxoic.supabase.co/**', (route) => {
      const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      if (p === '/auth/v1/otp') { rec.otp.push({ email: body.email, redirect: u.searchParams.get('redirect_to') || body.redirect_to || '' }); return json({}); }
      if (p === '/auth/v1/user') return json({ msg: 'no session' }, 401);
      const m = p.match(/^\/rest\/v1\/rpc\/(.+)$/);
      if (m) { rec.rpc.push({ fn: m[1], args: body }); return json(rpc && rpc[m[1]] !== undefined ? rpc[m[1]] : null); }
      const f = p.match(/^\/functions\/v1\/([^/?]+)/);
      if (f) { const o = fn && fn[f[1]]; if (o && o.status) return json(o.body, o.status); return json(o || {}); }
      return json([]);
    });
    const page = await ctx.newPage();
    await page.goto('https://trustnetsocial.com' + url);
    await page.waitForFunction(() => { const ls = document.getElementById('loading-screen'); return !ls || getComputedStyle(ls).display === 'none' || ls.style.opacity === '0'; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    return { ctx, page, rec };
  };
  // On the old page the box is hidden behind 'Use email instead': that is a
  // failure to record, not a reason to stop the run.
  const sendEmail = async (page) => {
    if (!(await page.isVisible('#login-email'))) { ck('the email box is there to type into', false, 'hidden'); return; }
    await page.fill('#login-email', 'maya@example.com');
    await page.click('#login-send');
    await page.waitForTimeout(800);
  };
  const signInShape = (label, L) => {
    const primary = L.btns.filter((b) => b.primary);
    const wa = L.btns.filter((b) => /Continue with WhatsApp/.test(b.t));
    ck(label + ': the one green button is Continue with email', primary.length === 1 && primary[0].t === 'Continue with email', JSON.stringify(primary.map((b) => b.t)));
    ck(label + ': ...with the email box already showing above it', !!L.email && primary[0] && L.email.bottom <= primary[0].top + 1, JSON.stringify(L.email));
    ck(label + ': Continue with WhatsApp is second, not green', wa.length === 1 && !wa[0].primary && primary[0] && wa[0].top > primary[0].bottom, JSON.stringify(wa));
    ck(label + ': ...with its instructions under it', !!L.how && wa[0] && L.how.top >= wa[0].bottom - 1, JSON.stringify(L.how));
    ck(label + ': no "Use email instead", no "No password", no "No code to type"', !/use email instead|no password|no code to type/i.test(L.text),
       (L.text.match(/.*(use email instead|no password|no code to type).*/i) || [''])[0]);
    ck(label + ': all of it on screen without scrolling, nothing wider than the phone', L.lowest <= 844 && L.wide <= 0, 'lowest ' + Math.round(L.lowest) + ', wider by ' + L.wide);
  };

  try {
    console.log('== 1. Sign in ==\n');
    {
      const { ctx, page, rec } = await open('/');
      const L = await page.evaluate(look);
      signInShape('Sign in', L);
      ck('Sign in: its heading is there', L.heading);
      await sendEmail(page);
      ck('email: Continue sends the sign-in link to that address', rec.otp.length === 1 && rec.otp[0].email === 'maya@example.com', JSON.stringify(rec.otp));
      ck('...and says to check the email', await page.isVisible('#login-sent'));
      await ctx.close();
    }
    {
      const { ctx, page, rec } = await open('/', { mint_signin_token: 'K7Q2M9', claim_status: { claimed: false } });
      await page.click('#login-wa-go');
      await page.waitForTimeout(900);
      ck('WhatsApp: a plain sign-in code is made', rec.rpc.some((c) => c.fn === 'mint_signin_token') && !rec.rpc.some((c) => c.fn === 'mint_join_token'), JSON.stringify(rec.rpc.map((c) => c.fn)));
      ck('...WhatsApp opens with the message written', rec.opened.some((u) => /wa\.me\/972587786049\?text=Join Trustnet: K7Q2M9/.test(u)), JSON.stringify(rec.opened));
      const w = await page.evaluate(() => ({ t: document.getElementById('login').innerText, email: !!document.getElementById('login-email').offsetParent }));
      ck('...the screen says press send, and the email box is gone', /Press send in WhatsApp/.test(w.t) && !w.email, JSON.stringify(w).slice(0, 160));
      await ctx.close();
    }

    console.log('\n== 2. A circle invitation (the shared link) ==\n');
    const INV = { invite_preview: { ok: true, inviter: 'Tom', circle: 'Travel' }, mint_join_token: 'J4X8P2', claim_status: { claimed: false } };
    {
      const { ctx, page, rec } = await open('/?join=AbC123xyz', INV);
      const L = await page.evaluate(look);
      ck('it says who is inviting, to which circle', /Tom is inviting you to their Travel circle/.test(L.text), L.text.slice(0, 120));
      signInShape('Invitation', L);
      ck('Invitation: the invitation is the heading - no "Sign in" under it', !L.heading);
      ck('Invitation: no numbered WhatsApp steps', !/Come back here/.test(L.text));
      ck('Invitation: its WhatsApp button is the one that joins the circle', L.btns.some((b) => /Continue with WhatsApp/.test(b.t) && b.action === 'codeless-join'), JSON.stringify(L.btns));
      await sendEmail(page);
      ck('email: the sign-in link carries the invitation, so it joins too', rec.otp.length === 1 && /join=AbC123xyz/.test(rec.otp[0].redirect), JSON.stringify(rec.otp));
      await ctx.close();
    }
    {
      const { ctx, page, rec } = await open('/?join=AbC123xyz', INV);
      const wa = await page.$('[data-action="codeless-join"]');
      if (wa) await wa.click();
      await page.waitForTimeout(900);
      ck('WhatsApp: a JOIN code is made, for this invitation', rec.rpc.some((c) => c.fn === 'mint_join_token' && c.args.p_invite === 'AbC123xyz'), JSON.stringify(rec.rpc));
      ck('...never a plain sign-in', !rec.rpc.some((c) => c.fn === 'mint_signin_token'));
      ck('...WhatsApp opens with the join message', rec.opened.some((u) => /Join Trustnet: J4X8P2/.test(u)), JSON.stringify(rec.opened));
      const w = await page.evaluate(() => ({ t: document.getElementById('login').innerText, email: !!document.getElementById('login-email').offsetParent }));
      ck('...the screen says press send, and the email box is gone', /Press send in WhatsApp/.test(w.t) && !w.email, JSON.stringify(w).slice(0, 160));
      await ctx.close();
    }

    console.log('\n== 3. When the link did not work ==\n');
    for (const [label, url, rpc, fn, says] of [
      ['Invitation used', '/?invite=' + 'c'.repeat(32), { personal_invite_preview: { ok: false, reason: 'used' } }, null, /already been used/],
      ['Invitation no longer valid', '/?join=nope', { invite_preview: { ok: false } }, null, /no longer valid/],
      ['Reply link already used', '/?finish=' + 'f'.repeat(32), null, { 'complete-join': { status: 410, body: { error: 'finish_used' } } }, /already been used or has expired/],
    ]) {
      const { ctx, page } = await open(url, rpc, fn);
      const L = await page.evaluate(look);
      ck(label + ': it says what happened', says.test(L.text), L.text.slice(0, 120));
      signInShape(label, L);
      await ctx.close();
    }

    console.log('\n== 4. Your own invitation keeps its three steps ==\n');
    {
      const { ctx, page } = await open('/?invite=' + 'b'.repeat(32), { personal_invite_preview: { ok: true, inviter: 'Tal', circle: 'Puglia trip' } });
      const L = await page.evaluate(look);
      ck('who asked, a name, a location and Sign in', /Tal is inviting you to their Puglia trip circle/.test(L.text) && JSON.stringify(L.btns.map((b) => b.t)) === '["Sign in"]', JSON.stringify(L.btns.map((b) => b.t)));
      ck('...and no email box, no WhatsApp', !L.email && !/Continue with/.test(L.text));
      await ctx.close();
    }
  } catch (e) {
    fail++; console.log('  FAIL  threw: ' + String(e && e.message || e).split('\n')[0]);
  } finally { await browser.close(); }

  console.log('\n  ' + (OLD ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
