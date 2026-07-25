// Runs FIRST as a dependency of every browser project. Ensures a valid
// logged-in session exists in .auth/session.json before any spec runs.
const { test: setup, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUTH_FILE = path.join(__dirname, '..', '.auth', 'session.json');
const ACCOUNT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test-account.json'), 'utf8'));

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

setup('authenticate', async ({ page, context }) => {
  setup.skip(!!process.env.CI, 'CI has no human to paste a code — public specs only');
  setup.setTimeout(5 * 60 * 1000); // allow time for the human paste

  // Reuse a still-valid session if we have one.
  if (fs.existsSync(AUTH_FILE)) {
    const probe = await context.browser().newContext({ storageState: AUTH_FILE });
    const p = await probe.newPage();
    await p.goto('/');
    await p.waitForLoadState('networkidle');
    const loggedOut = await p.locator('#login-email').isVisible().catch(() => true);
    await probe.close();
    if (!loggedOut) { console.log('[auth] saved session still valid — reusing'); return; }
    console.log('[auth] saved session expired — logging in again');
  }

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('#login-email').fill(ACCOUNT.email);
  await page.locator('#login-send').click();
  console.log('\n[auth] sign-in code emailed to ' + ACCOUNT.email);

  const code = await ask('\n>>> Paste the 6-digit code from that inbox and press Enter: ');
  await page.locator('#login-code').fill(code);
  await page.locator('#login-verify').click();
  await page.waitForTimeout(2500);

  // Fresh accounts see onboarding — complete it.
  if (await page.locator('#ob-start').isVisible().catch(() => false)) {
    console.log('[auth] onboarding detected — completing');
    await page.locator('#ob-name').fill('E2E Tester');
    await page.locator('#ob-location').fill('Tel Aviv, IL');
    await page.locator('#ob-start').click();
    await page.waitForTimeout(2000);
  }

  await expect(page.locator('#login-email')).toBeHidden({ timeout: 15000 });
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  console.log('[auth] logged in; session saved — future runs skip this until it expires');
});
