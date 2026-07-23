// Shared helpers so every spec enters the app the same way.
const { expect } = require('@playwright/test');

// Wait until the app shell has booted (demo-users list is populated by renderSidebar).
async function waitAppReady(page) {
  await page.waitForLoadState('networkidle');
  // The version footer is always rendered once the shell mounts.
  await expect(page.locator('#app-version-footer')).toBeVisible({ timeout: 15000 });
}

// Enter demo mode as the first demo user (Noa Levi). No credentials needed —
// this is what makes the bulk of the suite CI-safe.
async function enterDemo(page) {
  await page.goto('/');
  await waitAppReady(page);
  const firstDemo = page.locator('#sb-demo-users [data-action="switch-demo"]').first();
  await expect(firstDemo).toBeVisible({ timeout: 15000 });
  await firstDemo.click();
  // After switching, the demo user's circles exist — Dining is seeded.
  await expect(page.getByText('Dining', { exact: true }).first()).toBeVisible({ timeout: 15000 });
}

// Live login via one-time code — used ONLY by the live-data spec, gated behind a secret.
// The code is injected as TN_TEST_LOGIN_CODE (a GitHub Actions secret), never hard-coded.
async function loginWithCode(page) {
  const code = process.env.TN_TEST_LOGIN_CODE;
  if (!code) throw new Error('TN_TEST_LOGIN_CODE not set — live-login spec skipped by design');
  await page.goto('/');
  await waitAppReady(page);
  await page.locator('#login-code').fill(code);
  await page.locator('#login-verify').click();
  // Real library loads from Supabase once authenticated.
  await expect(page.getByText('Library', { exact: false }).first()).toBeVisible({ timeout: 20000 });
}

module.exports = { waitAppReady, enterDemo, loginWithCode };
