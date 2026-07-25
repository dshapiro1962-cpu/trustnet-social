const { test, expect } = require('@playwright/test');
const { hasSession } = require('./helpers/app');

// The crown-jewel check: with the logged-in session, the respond page's
// debug trace must find the session, hit the REST API, and show the strip.
test.describe('respond — answer-from-library machinery (live session)', () => {
  test.skip(!hasSession(), 'no saved session');

  test('debug trace proves session → REST 200 → strip shown', async ({ page }) => {
    await page.goto('/respond.html?t=selftest&debug=1');
    const dbg = page.locator('#lib-debug');
    await expect(dbg).toBeVisible({ timeout: 15000 });
    await expect(dbg).toContainText('session: found', { timeout: 15000 });
    await expect(dbg).toContainText('REST status: 200');
    await expect(dbg).toContainText('strip: SHOWN');
  });
});
