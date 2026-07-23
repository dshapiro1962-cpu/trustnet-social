const { test, expect } = require('@playwright/test');
const { waitAppReady, enterDemo } = require('./helpers/app');

test.describe('smoke — the app loads and renders', () => {
  test('landing page mounts with sign-in and demo users', async ({ page }) => {
    await page.goto('/');
    await waitAppReady(page);
    await expect(page.locator('#login-code')).toBeVisible();
    await expect(page.locator('#sb-demo-users [data-action="switch-demo"]').first()).toBeVisible();
  });

  test('version footer shows a live version marker', async ({ page }) => {
    await page.goto('/');
    await waitAppReady(page);
    const footer = await page.locator('#app-version-footer').innerText();
    expect(footer).toMatch(/v\d+\.\d+\.\d+ · live/);
  });

  test('entering demo mode reveals seeded circles', async ({ page }) => {
    await enterDemo(page);
    await expect(page.getByText('Dining', { exact: true }).first()).toBeVisible();
  });
});
