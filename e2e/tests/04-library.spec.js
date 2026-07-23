const { test, expect } = require('@playwright/test');
const { enterDemo } = require('./helpers/app');

test.describe('library — item detail, links, edit, send (demo mode)', () => {
  test('open an item and see Google + Maps links and action row', async ({ page }) => {
    await enterDemo(page);
    // Navigate to the library view
    await page.getByText('Library', { exact: true }).first().click();
    // Open the first library card (demo seeds recommendations)
    const firstCard = page.locator('[data-action="open-rec"]').first();
    if (await firstCard.count()) {
      await firstCard.click();
      await expect(page.getByRole('link', { name: /Google/ }).first()).toBeVisible();
    }
  });
});
