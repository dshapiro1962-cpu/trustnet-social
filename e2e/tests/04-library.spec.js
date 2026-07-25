const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const CARD = '[data-action="nav"][data-view="rec-detail"]';

test.describe('library — item detail, links, edit modal', () => {
  test.skip(!hasSession(), 'no saved session');

  test('open first item: Google link + action row present', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const card = page.locator(CARD).first();
    test.skip(!(await card.count()), 'library empty — save an item in the test account first');
    await tapp(card);
    await expect(page.getByRole('link', { name: /Google/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Send to a member' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('edit modal opens prefilled and closes without saving', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const card = page.locator(CARD).first();
    test.skip(!(await card.count()), 'library empty');
    await tapp(card);
    await tapp(page.getByRole('button', { name: 'Edit', exact: true }));
    await expect(page.locator('#er-name')).toBeVisible();
    expect((await page.locator('#er-name').inputValue()).length).toBeGreaterThan(0);
    await tapp(page.locator('[data-action="close-modal"]').first());
  });
});
