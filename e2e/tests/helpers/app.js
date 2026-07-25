const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '..', '..', '.auth', 'session.json');
const hasSession = () => {
  try {
    const st = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return Array.isArray(st.origins) && st.origins.length > 0;
  } catch (e) { return false; }
};

// Ready = login card gone AND at least one VISIBLE actionable element exists.
async function waitLoggedInShell(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#login-email')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('[data-action]:visible').first()).toBeVisible({ timeout: 15000 });
}

// Navigate through the app's own router — deterministic on every viewport.
async function goView(page, view) {
  await page.evaluate((v) => { showView(v); }, view);
  await page.waitForTimeout(600); // let render settle
}

// Scroll-then-click; force as last resort for header-clipped buttons on phones.
async function tapp(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try { await locator.click({ timeout: 8000 }); }
  catch (e) { await locator.click({ force: true }); }
}

module.exports = { hasSession, waitLoggedInShell, goView, tapp, AUTH_FILE };
