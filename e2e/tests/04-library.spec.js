const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView } = require('./helpers/app');

test.describe('library — item detail, links, edit modal', () => {
  test.skip(!hasSession(), 'no saved session');

  test('open first item: Google link + action row present', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const card = page.locator('[data-action="open-rec"]').first();
    test.skip(!(await card.count()), 'library empty — save an item in the test account first');
    await card.click();
    await expect(page.getByRole('link', { name: /Google/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Send to a member' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('edit modal opens prefilled and closes without saving', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const card = page.locator('[data-action="open-rec"]').first();
    test.skip(!(await card.count()), 'library empty');
    await card.click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('#er-name')).toBeVisible();
    const val = await page.locator('#er-name').inputValue();
    expect(val.length).toBeGreaterThan(0);
    await page.locator('[data-action="close-modal"]').first().click();
  });
});
