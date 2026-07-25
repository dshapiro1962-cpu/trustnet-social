const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const FIXTURE = path.join(__dirname, '..', '..', 'simulation_suite', 'shikun_fixture.txt');

test.describe('chat import — real file through real extraction (no save)', () => {
  test.skip(!hasSession(), 'no saved session');
  test.skip(!fs.existsSync(FIXTURE), 'shikun fixture not found in repo');
  test.setTimeout(180 * 1000); // one real AI extraction round

  test('fixture scan yields a reviewable, editable list', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const btn = page.locator('[data-modal="chat-import"]').first();
    test.skip(!(await btn.count()), 'strip not present');
    await tapp(btn);
    await page.locator('#ci-file').setInputFiles(FIXTURE);
    await tapp(page.getByRole('button', { name: 'Scan chat' }));
    // Review list appears when extraction returns (batches of 150 → 1 batch here).
    await expect(page.locator('.ci-cb').first()).toBeVisible({ timeout: 150 * 1000 });
    const found = await page.locator('.ci-cb').count();
    expect(found).toBeGreaterThanOrEqual(4); // calibrated run found 8; demand a sane floor
    await expect(page.locator('.ci-name').first()).toBeVisible(); // names editable
    await expect(page.locator('#ci-circle')).toBeVisible();       // circle picker offered
    // Deliberately DO NOT save — keep the test library clean.
    await tapp(page.locator('[data-action="close-modal"]').first());
  });
});
