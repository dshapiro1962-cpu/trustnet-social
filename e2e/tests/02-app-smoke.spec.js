const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView } = require('./helpers/app');

test.describe('smoke — logged-in shell', () => {
  test.skip(!hasSession(), 'no saved session');

  test('app loads logged in; login card absent', async ({ page }) => {
    await waitLoggedInShell(page);
  });

  test('library and circles views open', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    await expect(page.getByText('My Library').first()).toBeVisible({ timeout: 10000 });
    await goView(page, 'circles');
    await expect(page.locator('[data-modal="add-circle"]').first()).toBeAttached({ timeout: 10000 });
  });
});
