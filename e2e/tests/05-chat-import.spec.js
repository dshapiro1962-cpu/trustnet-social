const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

test.describe('chat import — modal reachable', () => {
  test.skip(!hasSession(), 'no saved session');

  test('import modal opens with file input and scan button', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const btn = page.locator('[data-modal="chat-import"]').first();
    test.skip(!(await btn.count()), 'collections strip not present in this account state');
    await tapp(btn);
    await expect(page.locator('#ci-file')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan chat' })).toBeVisible();
  });
});
