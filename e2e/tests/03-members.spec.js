const { test, expect } = require('@playwright/test');
const { enterDemo } = require('./helpers/app');

test.describe('members — add to a circle (demo mode)', () => {
  test('open a circle and reach the add-member modal', async ({ page }) => {
    await enterDemo(page);
    await page.getByText('Dining', { exact: true }).first().click();
    await page.getByRole('button', { name: /Add member|\+ Member/ }).first().click();
    await expect(page.locator('#nm-name')).toBeVisible();
  });
});
