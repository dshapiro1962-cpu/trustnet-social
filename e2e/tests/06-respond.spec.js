const { test, expect } = require('@playwright/test');

test.describe('respond page — answer form loads', () => {
  test('respond page renders a state for a self-test token', async ({ page }) => {
    await page.goto('/respond.html?t=selftest');
    // Either the form, the thanks, or the "already used" state must appear —
    // the card must mount without JS errors.
    await expect(page.locator('.card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Trustnet').first()).toBeVisible();
  });

  test('respond version marker present', async ({ page }) => {
    await page.goto('/respond.html?t=selftest');
    const html = await page.content();
    expect(html).toMatch(/r\d+\.\d+-lib/);
  });
});
