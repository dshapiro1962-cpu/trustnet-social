const { test, expect } = require('@playwright/test');

// These need NO login — safe everywhere, including CI.
test.describe('public — login screen and respond page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // force logged-out

  test('login card offers both sign-in paths', async ({ page }) => {
    await page.goto('/');
    // WhatsApp is the DEFAULT pane and #login-email-pane starts display:none.
    // The previous assertion expected #login-email to be VISIBLE on load, which
    // was true until the WhatsApp/Email tabs were added — so this began failing
    // on a working app. Stale test, not a regression.
    // What matters is that BOTH paths are present, not which one is showing.
    await expect(page.locator('#login-tab-wa')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#login-tab-email')).toBeVisible();
    await expect(page.locator('#login-phone')).toBeVisible();
    await expect(page.locator('#login-wa-send')).toBeVisible();
    await expect(page.locator('#login-email')).toBeAttached();
    await expect(page.locator('#login-send')).toBeAttached();
    await expect(page.locator('#login-code')).toBeAttached();
    await expect(page.locator('#login-verify')).toBeAttached();
  });

  test('respond page mounts and carries a version marker', async ({ page }) => {
    await page.goto('/respond.html?t=selftest');
    await expect(page.locator('.card')).toBeVisible({ timeout: 15000 });
    expect(await page.content()).toMatch(/r\d+\.\d+-lib/);
  });
});
