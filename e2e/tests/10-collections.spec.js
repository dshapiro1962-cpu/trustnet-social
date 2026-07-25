const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

const TITLE = 'רשימת בדיקות E2E';
const RENAMED = 'רשימת בדיקות E2E — שונה';

test.describe('collections — create, public page, edit, delete', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90 * 1000);

  let token = '';

  test('create a collection and capture its token', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    const createBtn = page.locator('[data-modal="collection-create"]').first();
    test.skip(!(await createBtn.count()), 'strip not present');
    await tapp(createBtn);
    await page.locator('#coll-title').fill(TITLE);
    // The handler REQUIRES at least one item ticked ('Pick at least one item.').
    const firstItem = page.locator('.coll-item-cb').first();
    test.skip(!(await firstItem.count()), 'library empty — cannot form a collection');
    await firstItem.check();
    await tapp(page.locator('[data-action="create-collection"]').first());
    // Functional proof = the collection row with its token exists (mobile strip may clip visibility).
    const linkBtn = page.locator('[data-action="copy-collection-link"]').last();
    await expect(linkBtn).toBeAttached({ timeout: 15000 });
    await expect(page.getByText(TITLE).first()).toBeAttached({ timeout: 5000 });
    token = await linkBtn.getAttribute('data-token');
    expect((token || '').length).toBeGreaterThan(5);
  });

  test('public collection page serves the new list', async ({ page }) => {
    test.skip(!token, 'no token captured');
    await page.goto('/collection.html?t=' + token);
    await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 15000 });
  });

  test('edit then delete the collection', async ({ page }) => {
    await waitLoggedInShell(page);
    await goView(page, 'library');
    await tapp(page.locator('[data-modal="edit-collection"]').last());
    await expect(page.locator('#ecl-title')).toBeVisible();
    await page.locator('#ecl-title').fill(RENAMED);
    await tapp(page.locator('[data-action="save-edit-collection"]').first());
    await expect(page.getByText(RENAMED).first()).toBeAttached({ timeout: 10000 });
    page.on('dialog', (d) => d.accept());
    await tapp(page.locator('[data-action="delete-collection"]').last());
    await expect(page.getByText(RENAMED)).toHaveCount(0, { timeout: 10000 });
  });
});
