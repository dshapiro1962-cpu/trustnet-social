const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const CIRCLE = 'חוג שאילתות E2E';
const MEMBER = 'E2E Answerer';
// NOTE: the app (correctly) refuses the signed-in account's own email as a member.
// We use a WhatsApp member with a syntactically valid, non-allocated test number.
const QTEXT = 'בדיקת מערכת — מי מכיר חשמלאי טוב?';

test.describe('query loop — circle, member, real send, delivery screen', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90 * 1000);

  test('create circle and add an email member', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.locator('[data-modal="add-circle"]').first());
    await page.locator('#nc-name').fill(CIRCLE);
    await tapp(page.getByRole('button', { name: 'Create Circle' }));
    // The app navigates INTO the new circle (showView('circle-detail')) — no extra click.
    await expect(page.getByText(CIRCLE).first()).toBeVisible({ timeout: 10000 });

    await tapp(page.locator('[data-modal="add-member"]').first());
    await expect(page.locator('#nm-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#nm-name').fill(MEMBER);
    // Default method ('app') = in-app member: real send-query round trip,
    // zero external delivery attempts (no WA/email side effects).
    await tapp(page.locator('[data-action="save-member"]').first());
    await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
  });

  test('send a real query and reach the delivery screen', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'query');
    await tapp(page.locator('[data-action="select-circle"]', { hasText: CIRCLE }).first());
    await page.locator('#q-text').fill(QTEXT);
    await tapp(page.locator('[data-action="send-query"]').first());
    // Sent phase: the query text is echoed on the delivery screen with the member listed.
    await expect(page.getByText(QTEXT).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
  });

  test('cleanup: delete the test circle', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.getByText(CIRCLE).first());
    page.on('dialog', (d) => d.accept());
    await tapp(page.getByRole('button', { name: 'Delete', exact: true }).first());
    await expect(page.getByText(CIRCLE)).toHaveCount(0, { timeout: 10000 });
  });
});
