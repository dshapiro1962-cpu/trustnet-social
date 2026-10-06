const { test, expect } = require('@playwright/test');

// These need NO login — safe everywhere, including CI.
//
// REWRITTEN 6 Oct 2026. This spec had described a login screen that stopped
// existing on 22 September, when v0.97.0 replaced the 6-digit WhatsApp code
// with one button (dan: "no digit path discard it"). It failed on every push
// touching web/** for two weeks, and the only signal was mail arriving on
// dan's phone — `gh` is not installed on his machine, so workflow results are
// invisible from there.
//
// It asserted #login-tab-wa was VISIBLE. The element is still in the markup
// and is deliberately HIDDEN: index.html:1352 puts display:none on the whole
// tab row, with the comment "An invited person needs no phone box, no email
// box, no tabs". So it failed on its first line, not on the deleted elements —
// which is why reading the file was not enough to diagnose it, and running it
// was.
//
// Verified before replacing: this version passes against the live site and
// FAILS against simulation_suite/index.pre-v0.97.0.html served locally, so it
// measures the change rather than merely being green.
test.describe('public — login screen and respond page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // force logged-out

  test('login card offers both sign-in paths', async ({ page }) => {
    await page.goto('/');

    // WHAT A SIGNED-OUT PERSON ACTUALLY SEES (v0.97.0): one button.
    await expect(page.locator('#login-wa-go')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#login-wa-go')).toHaveText(/WhatsApp/i);

    // And one way out of it, for someone whose WhatsApp is on another phone.
    await expect(page.locator('#login-to-email')).toBeVisible();

    // The email path exists but is not shown until it is asked for.
    await expect(page.locator('#login-email')).toBeAttached();
    await expect(page.locator('#login-send')).toBeAttached();
    await expect(page.locator('#login-email-pane')).toBeHidden();

    // THE DIGIT PATH IS GONE AND MUST STAY GONE. It never worked once: nine
    // codes requested since 10 August, none ever consumed, because the message
    // carrying them was free-form and WhatsApp blocks those outside a 24-hour
    // window. Asserting its ABSENCE is what stops it coming back.
    await expect(page.locator('#login-phone')).toHaveCount(0);
    await expect(page.locator('#login-wa-send')).toHaveCount(0);

    // The tab row is still in the markup and deliberately hidden. Asserting it
    // is NOT visible is the check the old spec had backwards.
    await expect(page.locator('#login-tab-wa')).toBeHidden();
  });

  test('respond page mounts and carries a version marker', async ({ page }) => {
    await page.goto('/respond.html?t=selftest');
    await expect(page.locator('.card')).toBeVisible({ timeout: 15000 });
    expect(await page.content()).toMatch(/r\d+\.\d+-lib/);
  });
});
