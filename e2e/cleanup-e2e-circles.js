// One-shot janitor: deletes ALL circles whose name contains 'חוג שאילתות E2E'
// from the logged-in test account, using the app's own delete flow.
// Run:  node cleanup-e2e-circles.js
const { chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = 'https://trustnetsocial.netlify.app';
const AUTH_FILE = path.join(__dirname, '.auth', 'session.json');
const TARGET = 'חוג שאילתות E2E';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const loggedOut = await page.locator('#login-email').isVisible().catch(() => true);
  if (loggedOut) { console.log('Session expired — run npx playwright test once to refresh it, then rerun this.'); await browser.close(); process.exit(1); }

  let deleted = 0;
  for (let round = 0; round < 40; round++) {
    await page.evaluate(() => showView('circles'));
    await page.waitForTimeout(800);
    const row = page.getByText(TARGET).first();
    if (!(await row.count())) break;
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.click({ force: true });
    await page.waitForTimeout(600);
    const del = page.getByRole('button', { name: 'Delete', exact: true }).first();
    if (!(await del.count())) { console.log('Delete button not found — stopping.'); break; }
    await del.click({ force: true });
    await page.waitForTimeout(1200);
    deleted++;
    console.log('deleted #' + deleted);
  }
  console.log('DONE — removed ' + deleted + ' test circles.');
  await browser.close();
})();
