// Runs ONCE before the suite. Ensures a valid logged-in session exists in
// .auth/session.json. If missing/expired: performs the real code login,
// pausing in the terminal for Dan to paste the 6-digit code from the email.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_URL = process.env.BASE_URL || 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');
const ACCOUNT = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-account.json'), 'utf8'));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

async function sessionIsValid(browser) {
  if (!fs.existsSync(AUTH_FILE)) return false;
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Logged in ⇢ the login email field is NOT visible.
    const loginVisible = await page.locator('#login-email').isVisible().catch(() => false);
    await ctx.close();
    return !loginVisible;
  } catch (e) { await ctx.close(); return false; }
}

module.exports = async () => {
  // In CI there is no human to paste a code: public specs run, auth specs self-skip.
  if (process.env.CI) {
    console.log('[setup] CI detected — skipping login; authenticated specs will self-skip.');
    return;
  }
  const browser = await chromium.launch();
  if (await sessionIsValid(browser)) {
    console.log('[setup] Saved session is valid — skipping login.');
    await browser.close();
    return;
  }

  console.log('\n[setup] No valid session. Logging in as ' + ACCOUNT.email);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.locator('#login-email').fill(ACCOUNT.email);
  await page.locator('#login-send').click();
  console.log('[setup] Sign-in email sent to ' + ACCOUNT.email);

  const code = await ask('\n>>> Open that inbox, then paste the 6-digit code here and press Enter: ');
  await page.locator('#login-code').fill(code);
  await page.locator('#login-verify').click();

  // Either onboarding appears (fresh account) or the app shell does.
  await page.waitForTimeout(2500);
  const ob = page.locator('#ob-start');
  if (await ob.isVisible().catch(() => false)) {
    console.log('[setup] Onboarding detected — completing it.');
    await page.locator('#ob-name').fill('E2E Tester');
    await page.locator('#ob-location').fill('Tel Aviv, IL');
    await ob.click();
    await page.waitForTimeout(2000);
  }

  // Confirm logged-in state: login field gone.
  const stillLogin = await page.locator('#login-email').isVisible().catch(() => false);
  if (stillLogin) {
    await browser.close();
    throw new Error('[setup] Login failed — the sign-in form is still showing. Wrong/expired code?');
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
  console.log('[setup] Logged in; session saved to .auth/session.json — future runs skip login until it expires.');
  await browser.close();
};
