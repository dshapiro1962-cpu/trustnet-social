const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView } = require('./helpers/app');

test.describe('smoke — logged-in shell', () => {
  test.skip(!hasSession(), 'no saved session — run locally first (global setup logs in)');

  test('app loads logged in; login card absent', async ({ page }) => {
    await waitLoggedInShell(page);
  });

  test('library and circles views open', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    await expect(page.getByText(/Library/i).first()).toBeVisible({ timeout: 10000 });
    await goView(page, 'circles');
    await expect(page.getByRole('button', { name: '+ New circle' }).first()).toBeVisible({ timeout: 10000 });
  });
});
