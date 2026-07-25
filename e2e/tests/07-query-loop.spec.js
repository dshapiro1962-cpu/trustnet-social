const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const CIRCLE = 'חוג שאילתות E2E';
const MEMBER = 'E2E Answerer';
// Unique per run: satisfies the app's (correct!) similar-query guard.
const QTEXT = 'בדיקת מערכת ' + Date.now() + ' — מי מכיר חשמלאי טוב?';

test.describe('query loop — one session: circle → member → real send', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120 * 1000);

  test('create circle, add member, send query — single page, no persistence race', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    // Diagnostic nets: server answers + every toast the app EVER shows (captured live).
    const net = [];
    page.on('response', async (r) => {
      if (/send-query|check-similar-query/.test(r.url())) {
        let body = '';
        try { body = (await r.text()).slice(0, 300); } catch (e) {}
        net.push(r.url().split('/').pop() + ' -> ' + r.status() + ' ' + body);
      }
    });
    const toasts = [];
    await page.exposeFunction('__e2eToast', (m) => toasts.push(m));
    await page.addInitScript(() => {
      const obs = new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => {
          if (n.classList && n.classList.contains('toast')) window.__e2eToast(n.innerText);
        }));
      });
      window.addEventListener('DOMContentLoaded', () => {
        obs.observe(document.body, { childList: true, subtree: true });
      });
    });

    // 1) Circle
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.locator('[data-modal="add-circle"]').first());
    await page.locator('#nc-name').fill(CIRCLE);
    await tapp(page.getByRole('button', { name: 'Create Circle' }));
    await expect(page.getByText(CIRCLE).first()).toBeVisible({ timeout: 10000 });

    // 2) Member (default 'app' method — no external delivery)
    await tapp(page.locator('[data-modal="add-member"]').first());
    await expect(page.locator('#nm-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#nm-name').fill(MEMBER);
    await tapp(page.locator('[data-action="save-member"]').first());
    await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });

    // 3) Send — SAME page: member lives in AppState, no DB round-trip needed
    await goView(page, 'query');
    const chip = page.locator('[data-action="select-circle"]', { hasText: CIRCLE }).first();
    await expect(chip).toBeVisible({ timeout: 10000 });
    const chipText = (await chip.innerText()).replace(/\s+/g, ' ');   // shows the member COUNT
    const cid = await chip.getAttribute('data-circle-id');
    await tapp(chip);
    // PROVE the selection took; retry once if not.
    let selected = await page.locator('#q-circle').inputValue();
    if (selected !== cid) { await tapp(chip); selected = await page.locator('#q-circle').inputValue(); }
    net.push('DIAG chip="' + chipText + '" cid=' + cid + ' selected=' + selected);
    await page.locator('#q-text').fill(QTEXT);
    await tapp(page.locator('[data-action="send-query"]').first());
    try {
      await expect(page.getByText(QTEXT).first()).toBeVisible({ timeout: 25000 });
      await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
    } catch (e) {
      throw new Error('Send step failed.\nNETWORK: ' + JSON.stringify(net)
        + '\nTOASTS: ' + JSON.stringify(toasts) + '\nORIGINAL: ' + e.message);
    }
  });

  test('cleanup: delete the test circle (tolerant)', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    const row = page.getByText(CIRCLE).first();
    if (!(await row.count())) { test.skip(true, 'circle not persisted — nothing to clean'); return; }
    await tapp(row);
    page.on('dialog', (d) => d.accept());
    await tapp(page.getByRole('button', { name: 'Delete', exact: true }).first());
    await expect(page.getByText(CIRCLE)).toHaveCount(0, { timeout: 10000 });
  });
});
