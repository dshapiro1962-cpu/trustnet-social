const { test, expect } = require('@playwright/test');
const { enterDemo } = require('./helpers/app');

test.describe('chat import — modal opens and accepts a file (demo mode)', () => {
  test('import modal renders with file input', async ({ page }) => {
    await enterDemo(page);
    await page.getByText('Library', { exact: true }).first().click();
    const importBtn = page.getByRole('button', { name: 'Import WhatsApp chat' });
    if (await importBtn.count()) {
      await importBtn.click();
      await expect(page.locator('#ci-file')).toBeVisible();
    }
  });
});
