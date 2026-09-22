// codeless-signin-sim.js — signing in is sending a message (v0.97.0 / 0052).
//
// WHAT WAS BROKEN, measured in production on 22 Sep 2026:
//
//   codes requested since 10 Aug   9
//   codes ever used to sign in     0
//   wrong-code attempts recorded   0   <- nobody ever had a code to mistype
//
// wa-signin sent a FREE-FORM WhatsApp message. Meta only delivers those within
// 24 hours of that person messaging the business, so outside that window
// nothing arrived - and every other WhatsApp message this product sends is an
// approved template, so this was the one exception and it carried sign-in. The
// screen said "We sent a 6-digit code to ..." every time regardless, because
// the server returned `delivered: false` and the client discarded it.
//
// dan: "no digit path discard it", and sign-in and sign-up are one act.
//
// WHAT THIS RUNS
//   1. the REAL SQL, against the REAL database, in a transaction that is
//      ALWAYS rolled back: minting a token as an anonymous visitor, the
//      webhook recording a claim against it, the browser reading that claim,
//      spending it once, and every way it must be refused
//   2. the REAL login screen in headless Chrome at 390px: the digit form is
//      gone, one button remains, and pressing it mints a token and opens
//      WhatsApp with the message already written
//   3. complete-join's two-token shape, by source - there is no Deno here
//
//   node codeless-signin-sim.js         -> must PASS
//   node codeless-signin-sim.js --old   -> index.pre-v0.97.0.html and the
//                                          pre-0052 SQL, must FAIL
//
// Needs .env.local for TRUSTNET_DB_URL, and Chrome for section 2.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const REPO = path.join(__dirname, '..');
const { Client } = require(path.join(REPO, 'tools', 'node_modules', 'pg'));

const useOld = process.argv.indexOf('--old') > -1;
const PAGE = useOld ? path.join(__dirname, 'index.pre-v0.97.0.html')
                    : path.join(REPO, 'web', 'index.html');
if (!fs.existsSync(PAGE)) { console.error('missing fixture: ' + PAGE); process.exit(2); }
const envPath = path.join(REPO, '.env.local');
if (!fs.existsSync(envPath)) { console.error('no .env.local — skipping.'); process.exit(2); }
const url = (fs.readFileSync(envPath, 'utf8').match(/TRUSTNET_DB_URL\s*=\s*(.+)/) || [])[1].trim();

let pass = 0, fail = 0;
const ck = (n, c, x) => {
  if (c) { pass++; console.log('  ok    ' + n); }
  else { fail++; console.log('  FAIL  ' + n + (x !== undefined ? '   ' + String(JSON.stringify(x)).slice(0, 160) : '')); }
};
const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// The baseline for the SQL half: record_invite_claim as 0050 left it, which
// accepts a circle invite token and nothing else.
function oldRecordClaim() {
  const src = lf(path.join(REPO, 'migrations', '0050_whatsapp_already_said_their_name.sql'));
  const at = src.indexOf('create or replace function public.record_invite_claim(\n  p_token text, p_phone text, p_name text)');
  if (at < 0) return null;
  const end = src.indexOf('$function$;', at);
  return end < 0 ? null : src.slice(at, end + '$function$;'.length);
}

(async () => {
  console.log('\n   ' + (useOld ? 'CONTROL: before v0.97.0 / 0052   (must FAIL)' : 'the live sign-in') + '\n');
  console.log('== 1. the token, the claim, and the session it earns ==\n');
  const c = new Client({ connectionString: url });
  await c.connect();
  const before = (await c.query('select count(*)::int n from invite_claims')).rows[0].n;
  await c.query('begin');
  try {
    if (useOld) {
      const old = oldRecordClaim();
      if (!old) throw new Error('could not read the 0050 baseline');
      await c.query(old);
    }

    // The environment, before any claim is made about behaviour.
    const tbl = (await c.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name='signin_tokens'`)).rowCount;
    ck('[environment] there is somewhere to keep a sign-in token', tbl === 1);

    let tok = null;
    await c.query('savepoint mint');
    try {
      await c.query(`set local role anon`);
      tok = (await c.query(`select public.mint_signin_token() as t`)).rows[0].t;
      await c.query('reset role');
    } catch (e) {
      await c.query('rollback to savepoint mint');
      try { await c.query('reset role'); } catch (e2) {}
    }
    ck('a signed-out visitor can mint one', typeof tok === 'string' && tok.length >= 24, tok);
    if (tok) {
      await c.query(`set local role anon`);
      const seen = (await c.query(`select count(*)::int n from public.signin_tokens`)).rows[0].n;
      await c.query('reset role');
      // RLS filters rows, it does not raise: assert the row outcome.
      ck('...and reads nothing back out of that table', seen === 0, seen);
      ck('[control for that] the row is really there when the owner looks',
         (await c.query(`select count(*)::int n from signin_tokens where token=$1`, [tok])).rows[0].n === 1);

      const rec = (await c.query(
        `select public.record_invite_claim($1,'+972500000002','Naama') as r`, [tok])).rows[0].r;
      ck('the webhook can record the message she sent', rec.ok === true, rec);
      ck('...as a sign-in, with no circle attached', rec.kind === 'signin' && rec.circle === null, rec);

      const st = (await c.query(`select public.claim_status($1) as r`, [tok])).rows[0].r;
      ck('the waiting browser sees it, with the number that sent it',
         st.claimed === true && /972500000002/.test(st.phone || ''), st);
      ck('...and the name WhatsApp gave, so she is not called by her number',
         (await c.query(`select claimed_name from invite_claims where token=$1`, [tok])).rows[0].claimed_name === 'Naama');

      ck('the token is live until it is spent',
         (await c.query(`select public.is_live_signin_token($1) as b`, [tok])).rows[0].b === true);
      ck('spending it works', (await c.query(`select public.consume_signin_token($1) as b`, [tok])).rows[0].b === true);
      ck('...exactly once', (await c.query(`select public.consume_signin_token($1) as b`, [tok])).rows[0].b === false);
      ck('...after which it is not live',
         (await c.query(`select public.is_live_signin_token($1) as b`, [tok])).rows[0].b === false);
      ck('...and cannot be claimed again',
         (await c.query(`select public.record_invite_claim($1,'+972500000003',null) as r`, [tok])).rows[0].r.ok === false);
    }

    ck('an invented token is refused',
       (await c.query(`select public.record_invite_claim('not-a-real-token','+972500000004',null) as r`)).rows[0].r.ok === false);
    await c.query(`insert into signin_tokens (token, expires_at) values ('expired-probe', now() - interval '1 minute')`);
    ck('an expired token is refused',
       (await c.query(`select public.record_invite_claim('expired-probe','+972500000005',null) as r`)).rows[0].r.ok === false);

    // AND THE INVITE MUST BE UNTOUCHED. This is the guard that matters most:
    // the change adds a second kind of token, it does not alter the first.
    const link = (await c.query(`select token from circle_invite_links where active limit 1`)).rows[0].token;
    const inv = (await c.query(`select public.record_invite_claim($1,'+972500000006',null) as r`, [link])).rows[0].r;
    ck('[guard] a circle invitation still records a claim and still names the circle',
       inv.ok === true && !!inv.circle, inv);
  } catch (e) {
    fail++; console.log('  FAIL  the SQL half threw: ' + e.message);
  } finally {
    await c.query('rollback');
  }
  const after = (await c.query('select count(*)::int n from invite_claims')).rows[0].n;
  ck('nothing was kept', before === after, before + '/' + after);
  await c.end();

  // ── 2. the screen ────────────────────────────────────────────────────────
  console.log('\n== 2. the login screen, at 390px ==\n');
  const html = lf(PAGE);
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(CHROME)) {
    console.log('  (no Chrome here — the screen cannot be checked, and this does not pass without it)');
    fail++;
  } else {
    const TMP = process.env.TEMP || process.env.TMP || '.';
    const probe = `
<script>
showLoginScreen = function () {};
window.addEventListener('load', function () {
  var out = {};
  setTimeout(function () {
    try {
      document.getElementById('loading-screen').style.display = 'none';
      var login = document.getElementById('login');
      login.style.display = 'flex';
      // The screen wires itself on show; call it as boot() would.
      if (typeof wireWhatsAppLogin === 'function') wireWhatsAppLogin();
      var scope = document.getElementById('login-methods');
      out.text = scope.textContent.replace(/\\s+/g, ' ').trim();
      // SCOPED TO THE WHATSAPP SIDE. Email still sends a link AND a code, and
      // that path is untouched — counting every numeric input on the screen
      // would have failed on the door dan kept.
      out.digitInputs = login.querySelectorAll('#login-wa-code, #login-phone, #login-wa-sent, #login-country').length
        + document.querySelectorAll('#login-wa-pane input').length;
      out.oneButton = !!document.getElementById('login-wa-go');
      out.emailDoor = !!document.getElementById('login-to-email');
      // USE the email link: it was wired inside the code path that went.
      document.getElementById('login-to-email').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      out.emailPaneShown = document.getElementById('login-email-pane').style.display !== 'none'
        && document.getElementById('login-wa-pane').style.display === 'none';
      document.getElementById('login-to-wa').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      out.backToWa = document.getElementById('login-wa-pane').style.display !== 'none';
      // Press the one button. The RPC and window.open are both stubbed so the
      // test can read what WOULD be sent.
      var opened = null;
      window.open = function (u) { opened = u; return null; };
      sb.rpc = function (name) {
        // The FIRST call is the one under test: polling calls claim_status a
        // moment later and would otherwise overwrite it.
        out.rpc = out.rpc || name;
        return Promise.resolve({ data: 'tok0123456789abcdef0123456789ab', error: null });
      };
      document.getElementById('login-wa-go').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setTimeout(function () {
        out.opened = opened;
        out.methodsHidden = document.getElementById('login-methods').style.display === 'none';
        out.panel = (document.getElementById('login-invite') || {}).textContent || '';
        out.overflow = document.documentElement.scrollWidth;
        try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e) {}
      }, 120);
    } catch (e) {
      out.threw = String((e && e.message) || e);
      try { parent.postMessage('R' + JSON.stringify(out), '*'); } catch (e2) {}
    }
  }, 250);
});
</` + `script>`;
    const inner = path.join(TMP, 'tn-signin-inner.html');
    fs.writeFileSync(inner, html.replace('</body>', probe + '</body>'), 'utf8');
    const outer = path.join(TMP, 'tn-signin-outer.html');
    fs.writeFileSync(outer, '<!doctype html><html><head><title>WAIT</title></head><body style="margin:0">'
      + '<iframe src="' + path.basename(inner) + '" style="width:390px;height:844px;border:0"></iframe>'
      + '<script>addEventListener("message",function(e){if(typeof e.data==="string"&&e.data.charAt(0)==="R")document.title=e.data;});</' + 'script></body></html>', 'utf8');
    let dom = '';
    try {
      dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,844',
        '--virtual-time-budget=8000', '--dump-dom', 'file:///' + outer.split(path.sep).join('/')],
        { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { dom = String(e.stdout || ''); }
    const m = dom.match(/<title>R([\s\S]*?)<\/title>/);
    const r = m ? JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'))
      : { threw: 'the page never reported back' };

    ck('the sign-in screen draws', !r.threw, r.threw);
    ck('there is nowhere left to type a code, or a number, to sign in with WhatsApp',
     r.digitInputs === 0, r.digitInputs);
    ck('...and it no longer promises one', !/send you a code|6-digit/i.test(r.text || ''), (r.text || '').slice(0, 120));
    ck('one button does it', r.oneButton === true);
    ck('it says what pressing it will do', /WhatsApp opens with a message ready/.test(r.text || ''), (r.text || '').slice(0, 160));
    ck('email is still a door', r.emailDoor === true && r.emailPaneShown === true, r);
    ck('...and you can come back from it', r.backToWa === true);
    ck('pressing it asks the server for a token', r.rpc === 'mint_signin_token', r.rpc);
    ck('...then opens WhatsApp, to the Trustnet number', /wa\.me\/972587786049/.test(r.opened || ''), r.opened);
    ck('...with the message already written', /Join%20Trustnet%3A%20tok0123/.test(r.opened || ''), r.opened);
    ck('...and the form gets out of the way', r.methodsHidden === true);
    ck('...leaving one instruction on screen', /Press send in WhatsApp/.test(r.panel || ''), (r.panel || '').slice(0, 120));
    ck('nothing runs off a 390px phone', r.overflow <= 390, r.overflow);
  }

  // ── 3. the server, by source ─────────────────────────────────────────────
  console.log('\n== 3. complete-join takes either kind of token (source) ==\n');
  const cj = lf(path.join(REPO, 'supabase', 'functions', 'complete-join', 'index.ts'));
  ck('[structure] a token with no circle is checked against the sign-in tokens',
     /is_live_signin_token/.test(cj));
  ck('[structure] ...and refused if it is neither', /return err\("invite_no_longer_valid", 410\)/.test(cj));
  ck('[structure] the phone must still match the recorded claim',
     /phoneKey\(claim\.claimed_phone\) !== phoneKey\(phone\)/.test(cj));
  ck('[structure] a sign-in joins no circle',
     /=\s*circle\s*\?\s*await admin\.rpc\("join_circle_as_user"/.test(cj));
  ck('[structure] the sign-in token is spent, like the claim', /consume_signin_token/.test(cj));
  ck('[structure] the answer says there was no circle', /circle: circle \? circle\.name : null/.test(cj));
  ck('[guard] the client no longer calls wa-signin at all',
     !/functions\/v1\/wa-signin/.test(html));

  console.log('\n  ' + (useOld ? 'CONTROL (must FAIL)' : 'PATCHED') + ': ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
