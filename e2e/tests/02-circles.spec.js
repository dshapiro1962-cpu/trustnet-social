const { test, expect } = require('@playwright/test');
const { enterDemo } = require('./helpers/app');

test.describe('circles — create, edit, delete (demo mode)', () => {
  test('create a circle with a Hebrew name (RTL input)', async ({ page }) => {
    await enterDemo(page);
    await page.getByRole('button', { name: '+ New circle' }).first().click();
    await page.locator('#nc-name').fill('חוג ספרים');
    await page.getByRole('button', { name: 'Create Circle' }).click();
    // The new circle must render with its Hebrew name visible (catches RTL/row bugs).
    await expect(page.getByText('חוג ספרים').first()).toBeVisible();
  });

  test('edit a circle name', async ({ page }) => {
    await enterDemo(page);
    await page.getByText('Dining', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.locator('#ec-name').fill('Dining & Wine');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Dining & Wine').first()).toBeVisible();
  });
});
