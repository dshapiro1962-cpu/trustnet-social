// Runs in the MAIN process (keyboard works here). Guarantees .auth/session.json
// exists before any test context is created:
//  - CI: writes an empty logged-out state (public specs only; auth specs skip)
//  - Local, valid session: reuses it
//  - Local, no/expired session: interactive code login with retries, then saves
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');
const ACCOUNT = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-account.json'), 'utf8'));
const EMPTY_STATE = { cookies: [], origins: [] };

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}
function writeEmpty() {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(EMPTY_STATE));
}

module.exports = async () => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  if (process.env.CI) {
    console.log('[auth] CI — writing logged-out state; authenticated specs will self-skip.');
    writeEmpty();
    return;
  }

  const browser = await chromium.launch();

  // Reuse a valid session if present.
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const probe = await browser.newContext({ storageState: AUTH_FILE });
      const p = await probe.newPage();
      await p.goto(BASE_URL, { waitUntil: 'networkidle' });
      const loggedOut = await p.locator('#login-email').isVisible().catch(() => true);
      await probe.close();
      if (!loggedOut) {
        console.log('[auth] saved session valid — reusing (no code needed).');
        await browser.close();
        return;
      }
      console.log('[auth] saved session expired — fresh login needed.');
    } catch (e) { console.log('[auth] session file unreadable — fresh login.'); }
  }

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.locator('#login-email').fill(ACCOUNT.email);
  await page.locator('#login-send').click();
  console.log('\n[auth] sign-in code emailed to ' + ACCOUNT.email);

  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    const code = await ask('\n>>> Open the NEWEST email (bottom of the Gmail thread), paste its code, press Enter (' + attempt + '/3): ');
    await page.locator('#login-code').fill(code);
    await page.locator('#login-verify').click();
    await page.waitForTimeout(3000);
    if (await page.locator('#ob-start').isVisible().catch(() => false)) {
      console.log('[auth] onboarding detected — completing.');
      await page.locator('#ob-name').fill('E2E Tester');
      await page.locator('#ob-location').fill('Tel Aviv, IL');
      await page.locator('#ob-start').click();
      await page.waitForTimeout(2000);
    }
    ok = !(await page.locator('#login-email').isVisible().catch(() => true));
    if (!ok) {
      const t = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      console.log('[auth] verify failed. Page says: ' + t);
    }
  }
  if (!ok) {
    writeEmpty(); // leave a valid (logged-out) file so contexts can still open; auth specs will skip
    await browser.close();
    throw new Error('[auth] 3 failed attempts. Re-run; use only the newest email; touch the account nowhere else meanwhile.');
  }

  await ctx.storageState({ path: AUTH_FILE });
  console.log('[auth] logged in; session saved. Future runs skip the code until it expires.');
  await browser.close();
};
