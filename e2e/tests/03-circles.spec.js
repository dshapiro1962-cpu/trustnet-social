const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const NAME = 'חוג בדיקות E2E';
const RENAMED = 'חוג בדיקות E2E — שונה';

test.describe('circles — full life cycle with cleanup', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });

  test('create a circle with a Hebrew name', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.locator('[data-modal="add-circle"]').first());
    await expect(page.locator('#nc-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#nc-name').fill(NAME);
    await tapp(page.getByRole('button', { name: 'Create Circle' }));
    await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10000 });
  });

  test('edit the circle name', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.getByText(NAME).first());
    await tapp(page.getByRole('button', { name: 'Edit', exact: true }).first());
    await expect(page.locator('#ec-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#ec-name').fill(RENAMED);
    await tapp(page.getByRole('button', { name: 'Save changes' }));
    await expect(page.getByText(RENAMED).first()).toBeVisible({ timeout: 10000 });
  });

  test('delete the circle (cleanup)', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.getByText(RENAMED).first());
    page.on('dialog', (d) => d.accept());
    await tapp(page.getByRole('button', { name: 'Delete', exact: true }).first());
    await expect(page.getByText(RENAMED)).toHaveCount(0, { timeout: 10000 });
  });
});
