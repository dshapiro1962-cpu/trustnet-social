const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const CIRCLE = 'חוג שאילתות E2E';
const MEMBER = 'E2E Answerer';
// Unique per run: satisfies the app's (correct!) similar-query guard.
const QTEXT = 'בדיקת מערכת ' + Date.now() + ' — מי מכיר חשמלאי טוב?';

test.describe('query loop — circle, member, real send, delivery screen', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90 * 1000);

  test('create circle and add an in-app member', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.locator('[data-modal="add-circle"]').first());
    await page.locator('#nc-name').fill(CIRCLE);
    await tapp(page.getByRole('button', { name: 'Create Circle' }));
    await expect(page.getByText(CIRCLE).first()).toBeVisible({ timeout: 10000 });

    await tapp(page.locator('[data-modal="add-member"]').first());
    await expect(page.locator('#nm-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#nm-name').fill(MEMBER);
    // Default method ('app') = in-app member: real send-query round trip,
    // zero external delivery attempts. (Own-email members are refused by design.)
    await tapp(page.locator('[data-action="save-member"]').first());
    await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
  });

  test('send a real query and reach the delivery screen', async ({ page }) => {
    // The app confirm()s on similar queries — always answer OK.
    page.on('dialog', (d) => d.accept());
    // Diagnostic net: capture the server's verbatim answers so any failure names itself.
    const net = [];
    page.on('response', async (r) => {
      if (/send-query|check-similar-query/.test(r.url())) {
        let body = '';
        try { body = (await r.text()).slice(0, 300); } catch (e) {}
        net.push(r.url().split('/').pop() + ' -> ' + r.status() + ' ' + body);
      }
    });

    await waitLoggedInShell(page);
    await goView(page, 'query');
    await tapp(page.locator('[data-action="select-circle"]', { hasText: CIRCLE }).first());
    await page.locator('#q-text').fill(QTEXT);
    await tapp(page.locator('[data-action="send-query"]').first());
    try {
      await expect(page.getByText(QTEXT).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
    } catch (e) {
      const toasts = await page.locator('.toast').allInnerTexts().catch(() => []);
      throw new Error('Send step failed.\nNETWORK: ' + JSON.stringify(net)
        + '\nTOASTS: ' + JSON.stringify(toasts) + '\nORIGINAL: ' + e.message);
    }
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
