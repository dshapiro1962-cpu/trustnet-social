const { test, expect } = require('@playwright/test');

// These need NO login — safe everywhere, including CI.
test.describe('public — login screen and respond page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // force logged-out

  test('login card renders with email and code paths', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#login-send')).toBeVisible();
    await expect(page.locator('#login-code')).toBeAttached();
    await expect(page.locator('#login-verify')).toBeAttached();
  });

  test('respond page mounts and carries a version marker', async ({ page }) => {
    await page.goto('/respond.html?t=selftest');
    await expect(page.locator('.card')).toBeVisible({ timeout: 15000 });
    expect(await page.content()).toMatch(/r\d+\.\d+-lib/);
  });
});
