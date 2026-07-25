const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView } = require('./helpers/app');

test.describe('chat import — modal reachable', () => {
  test.skip(!hasSession(), 'no saved session');

  test('import modal opens with file input and scan button', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const btn = page.getByRole('button', { name: 'Import WhatsApp chat' });
    test.skip(!(await btn.count()), 'collections strip not visible in this account state');
    await btn.click();
    await expect(page.locator('#ci-file')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan chat' })).toBeVisible();
  });
});
