const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView } = require('./helpers/app');

const NAME = 'חוג בדיקות E2E';
const RENAMED = 'חוג בדיקות E2E — שונה';

test.describe('circles — full life cycle with cleanup', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' }); // create → edit → delete in order

  test('create a circle with a Hebrew name', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await page.getByRole('button', { name: '+ New circle' }).first().click();
    await page.locator('#nc-name').fill(NAME);
    await page.getByRole('button', { name: 'Create Circle' }).click();
    await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 10000 });
  });

  test('edit the circle name', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await page.getByText(NAME).first().click();
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.locator('#ec-name').fill(RENAMED);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(RENAMED).first()).toBeVisible({ timeout: 10000 });
  });

  test('delete the circle (cleanup)', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await page.getByText(RENAMED).first().click();
    page.on('dialog', (d) => d.accept()); // confirm() → OK
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText(RENAMED)).toHaveCount(0, { timeout: 10000 });
  });
});
