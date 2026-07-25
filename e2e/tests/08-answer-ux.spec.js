const { test, expect } = require('@playwright/test');
const { hasSession } = require('./helpers/app');

// Full answerer experience with the two function endpoints mocked:
// real session, REAL library fetch (REST), mocked query meta + mocked receive.
test.describe('answer UX — strip search, prefill, edit, submit, thanks', () => {
  test.skip(!hasSession(), 'no saved session');

  test('library prefill flows through to a (mocked) successful send', async ({ page }) => {
    await page.route('**/response-meta*', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ requester_name: 'Dan', circle_name: 'Dining', query_text: 'מי רופא טוב?' }),
    }));
    let submitted = null;
    await page.route('**/receive-response', (route) => {
      submitted = JSON.parse(route.request().postData() || '{}');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto('/respond.html?t=e2e-mock-token');
    await expect(page.locator('#form-view')).toBeVisible({ timeout: 15000 });

    // Strip must appear (session + real library); skip politely if account not seeded.
    const strip = page.locator('#lib-strip');
    try { await expect(strip).toBeVisible({ timeout: 15000 }); }
    catch (e) { test.skip(true, 'library empty — seed the test account'); }

    const rows = page.locator('.lib-row');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });

    await rows.first().click();
    const name = await page.locator('#rec-name').inputValue();
    expect(name.length).toBeGreaterThan(0);
    await expect(page.locator('#lib-filled')).toBeVisible();

    await page.locator('#rec-note').fill('נערך בבדיקה אוטומטית');
    await page.locator('#submit-btn').click();
    await expect(page.locator('#thanks-view')).toBeVisible({ timeout: 10000 });
    expect(submitted && submitted.rec_name).toBe(name);
    expect(submitted.rec_note).toBe('נערך בבדיקה אוטומטית');
    await expect(page.locator('#convert-btn')).toHaveText(/Open your Trustnet/);
  });
});
