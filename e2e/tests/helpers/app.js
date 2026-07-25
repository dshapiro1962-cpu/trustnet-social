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

// Wait for the logged-in app shell (login card gone, app content interactive).
async function waitLoggedInShell(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#login-email')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('[data-action]').first()).toBeVisible({ timeout: 15000 });
}

// Navigate via the app's own nav actions (works regardless of sidebar state).
async function goView(page, view) {
  const nav = page.locator(`[data-action="nav"][data-view="${view}"]`).first();
  if (await nav.count()) { await nav.click(); return; }
  // Fallback: drive the app's own router directly.
  await page.evaluate((v) => { if (typeof showView === 'function') showView(v); }, view);
}

module.exports = { hasSession, waitLoggedInShell, goView, AUTH_FILE };
