const { test, expect } = require('@playwright/test');
const { hasSession, waitLoggedInShell, goView, tapp } = require('./helpers/app');

// ============================================================================
// 11-end-to-end.spec.js — THE WHOLE CHAIN, CROSSING THE SEAMS
//
// WHY THIS EXISTS: every failure in the seam audit had one shape — a producer
// leaves a field null and a consumer somewhere else degrades silently. 1116
// unit checks missed all of them, because each tests ONE function in the shape
// its author had in mind. The bugs live BETWEEN functions.
//
// This walks one chain and makes each step's real output the next step's input:
//   add a member (with a contact) -> send a query -> ANSWER IT as the
//   recipient, through respond.html with no account -> the answer becomes a
//   catalogue item -> it is enriched -> it is saved and findable by search.
//
// THE ANSWERER NEEDS NO SECOND ACCOUNT. send-query issues a response token per
// recipient; this test reads one from the network and opens respond.html with
// it, exactly as a person with no app would.
//
// RUNS LOCALLY ONLY. global-setup writes an empty state in CI and authenticated
// specs skip, which is a deliberate choice in this repo — do not "fix" it by
// putting credentials in CI.
// ============================================================================

const STAMP = Date.now();
const CIRCLE = 'E2E chain ' + STAMP;
const MEMBER = 'E2E Answerer';
// A contact is NOT optional any more. buildMember (v0.60.0) REFUSES a member
// without one, because send-query, send-collection and resend-member all
// dispatch on contact_method — a contactless member produced
// "Error: unsupported_channel" and cost a full day to trace. The old version of
// this spec filled only the name and would now fail at step 2, correctly.
const MEMBER_EMAIL = 'e2e+' + STAMP + '@trustnet.local';
const QTEXT = 'בדיקת שרשרת ' + STAMP + ' — מי מכיר חשמלאי טוב?';
// Unique per run so the assertions cannot pass on a leftover from last time.
const ANSWER_NAME = 'E2E חשמלאי ' + STAMP;
const ANSWER_NOTE = 'came from the end-to-end chain test';

test.describe('end to end — add member, send, answer, enrich, find', () => {
  test.skip(!hasSession(), 'no saved session');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180 * 1000);

  let responseToken = null;

  test('the whole chain', async ({ page, context }) => {
    page.on('dialog', (d) => d.accept());

    // Diagnostics, borrowed from 07-query-loop: without these a failure tells
    // you only that an element was missing, not what the server said.
    const net = [];
    page.on('response', async (r) => {
      if (/send-query|receive-response|librarian|check-similar-query/.test(r.url())) {
        let body = '';
        try { body = (await r.text()).slice(0, 600); } catch (e) { /* opaque */ }
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
    const fail = (what, e) => new Error(what + '\nNETWORK: ' + JSON.stringify(net)
      + '\nTOASTS: ' + JSON.stringify(toasts) + '\nORIGINAL: ' + (e && e.message));

    // ── 1. a circle ─────────────────────────────────────────────────────────
    await waitLoggedInShell(page);
    await goView(page, 'circles');
    await tapp(page.locator('[data-modal="add-circle"]').first());
    await page.locator('#nc-name').fill(CIRCLE);
    await tapp(page.getByRole('button', { name: 'Create Circle' }));
    await expect(page.getByText(CIRCLE).first()).toBeVisible({ timeout: 10000 });

    // ── 2. a member WITH A CONTACT ──────────────────────────────────────────
    await tapp(page.locator('[data-modal="add-member"]').first());
    // The dialog opens on the SEARCH pane (v0.45.0): find-first, not form-first.
    // "+ Add someone new" reveals the form.
    const addNew = page.locator('[data-action="add-new-person"]').first();
    if (await addNew.count()) await tapp(addNew);
    await expect(page.locator('#nm-name')).toBeVisible({ timeout: 10000 });
    await page.locator('#nm-name').fill(MEMBER);
    // Email, so nothing is actually delivered to a real phone.
    // The picker is scoped by data-picker-id; without it this can match the
    // INVITE dialog's method buttons instead.
    const emailTab = page.locator('[data-action="pick-segment"][data-picker-id="nm-method"][data-value="email"]').first();
    if (await emailTab.count()) await tapp(emailTab);
    await page.locator('#nm-contact').fill(MEMBER_EMAIL);
    await tapp(page.locator('[data-action="save-member"]').first());
    try {
      await expect(page.getByText(MEMBER).first()).toBeVisible({ timeout: 10000 });
    } catch (e) {
      throw fail('Member step failed — a contact is now REQUIRED (buildMember refuses without one).', e);
    }

    // ── 3. send the query, and CAPTURE THE RESPONSE TOKEN ───────────────────
    // The token is what lets the next step act as the RECIPIENT with no
    // account — the whole point of respond.html.
    let sendBody = null;
    const sendSeen = page.waitForResponse(
      (r) => r.url().includes('/send-query') && r.status() === 200, { timeout: 30000 });

    await goView(page, 'query');
    const chip = page.locator('[data-action="select-circle"]', { hasText: CIRCLE }).first();
    await expect(chip).toBeVisible({ timeout: 10000 });
    const cid = await chip.getAttribute('data-circle-id');
    await tapp(chip);
    let selected = await page.locator('#q-circle').inputValue();
    if (selected !== cid) { await tapp(chip); selected = await page.locator('#q-circle').inputValue(); }
    expect(selected).toBe(cid);
    await page.locator('#q-text').fill(QTEXT);
    await tapp(page.locator('[data-action="send-query"]').first());

    try {
      const resp = await sendSeen;
      sendBody = await resp.json();
    } catch (e) {
      throw fail('send-query never returned 200.', e);
    }
    // The shape has changed before; find the token wherever it lives rather
    // than assuming one field name.
    responseToken = (function findToken(o, depth) {
      if (!o || depth > 4) return null;
      if (typeof o === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(o)) return null;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (/token/i.test(k) && typeof v === 'string' && v.length >= 8) return v;
        if (v && typeof v === 'object') { const f = findToken(v, depth + 1); if (f) return f; }
      }
      return null;
    })(sendBody, 0);
    if (!responseToken) {
      throw fail('No response token in send-query output — the answerer cannot be simulated. BODY: '
        + JSON.stringify(sendBody).slice(0, 400));
    }

    // ── 4. ANSWER AS THE RECIPIENT — a separate page, NO account ────────────
    // This is the seam nothing else crosses: from the app, out to a URL a
    // stranger opens, and back into the database.
    const answerPage = await context.newPage();
    const recvSeen = answerPage.waitForResponse(
      (r) => r.url().includes('/receive-response'), { timeout: 30000 });
    await answerPage.goto('/respond.html?t=' + encodeURIComponent(responseToken));
    await expect(answerPage.locator('#rec-name')).toBeVisible({ timeout: 20000 });
    await answerPage.locator('#rec-name').fill(ANSWER_NAME);
    const noteBox = answerPage.locator('#rec-note');
    if (await noteBox.count()) await noteBox.fill(ANSWER_NOTE);
    // #submit-btn — verified in respond.html. Earlier drafts guessed at
    // button[type="submit"] and #rec-send; neither exists.
    await answerPage.locator('#submit-btn').click();
    let recvBody = null;
    try {
      const rr = await recvSeen;
      recvBody = await rr.json().catch(() => ({}));
      expect(rr.status()).toBeLessThan(400);
    } catch (e) {
      throw fail('receive-response did not succeed.', e);
    }

    // ── 5. the answer must reach the asker ──────────────────────────────────
    await page.reload();
    await waitLoggedInShell(page);
    await goView(page, 'inbox');
    try {
      await expect(page.getByText(ANSWER_NAME).first()).toBeVisible({ timeout: 30000 });
    } catch (e) {
      throw fail('The answer never reached the asker.', e);
    }

    // ── 6. save it, then FIND it ────────────────────────────────────────────
    // Closing the loop: an answer is only worth anything if it is findable
    // later. This also proves the answer was ENRICHED — an unenriched canonical
    // has no search document and cannot be found (fixed v0.59.0).
    const saveBtn = page.locator('[data-action="save-response-to-library"], [data-action="save-rec"]').first();
    if (await saveBtn.count()) {
      await tapp(saveBtn);
      await goView(page, 'library');
      await page.locator('#lib-search').fill(String(STAMP));
      try {
        await expect(page.getByText(ANSWER_NAME).first()).toBeVisible({ timeout: 30000 });
      } catch (e) {
        throw fail('Saved answer is not findable by search — enrichment may not have run.', e);
      }
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
