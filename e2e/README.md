# Trustnet E2E (Playwright)

Real-browser tests that drive the **deployed** app, catching UI-level bugs the
JS sims can't see (RTL rendering, unclickable buttons, session/lookup, colours).

## Run locally
```bash
cd e2e
npm install
npx playwright install --with-deps chromium
npx playwright test            # against https://trustnetsocial.netlify.app
npx playwright test --headed   # watch it click
npx playwright show-report     # open the last report
```

Point at a different build:
```bash
BASE_URL=https://deploy-preview-xyz.netlify.app npx playwright test
```

## What runs where
- **Specs 01–06** use the app's built-in **demo mode** — no credentials, safe to
  run anywhere and on every push. This is the bulk of the coverage.
- **Spec 07 (live-login)** touches a real account and **self-skips** unless the
  `TN_TEST_LOGIN_CODE` secret is present. Set it only in GitHub Actions secrets.

## CI
`.github/workflows/e2e.yml` runs on every push to `main` that touches `web/**`,
waits for Netlify, then runs the suite and uploads a report (with failure
screenshots + video) as a build artifact.

## Deliberately NOT automated
Sending a **real outbound WhatsApp** is a manual test — automating it would fire
real messages and burn Meta quota on every push.
