const { test, expect } = require('@playwright/test');
const { loginWithCode } = require('./helpers/app');

// This spec touches REAL user data via login. It self-skips when the secret
// is absent, so local/PR runs stay safe and only trusted CI runs it.
test.describe('live login — real account loads real library', () => {
  test.skip(!process.env.TN_TEST_LOGIN_CODE, 'no TN_TEST_LOGIN_CODE secret — live spec skipped');

  test('log in with a one-time code and land in the app', async ({ page }) => {
    await loginWithCode(page);
    await expect(page.locator('#app-version-footer')).toBeVisible();
  });
});
