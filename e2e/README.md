# Trustnet E2E (Playwright) — Option C design

Real-browser tests against the DEPLOYED app. Authenticated flows use a dedicated
test account (see test-account.json) with a paste-the-code login and a SAVED
SESSION, so most runs skip login entirely.

## The full run (local, before releases)
```powershell
cd C:\dev\trustnet-repo\e2e
npm install                                   # first time only
npx playwright install --with-deps chromium   # first time only
npx playwright test
```
- First run (or after the session expires): it emails a code to the test
  account, PAUSES, and asks you to paste the 6-digit code in the terminal.
  It then logs in, saves .auth/session.json, and runs everything.
- Subsequent runs: session is reused — no pause, fully automatic.
- Watch it click: `npx playwright test --headed`
- Open the last report: `npx playwright show-report`

## Test account
- Email in test-account.json (dshapiro3012@gmail.com).
- Onboard it ONCE by hand: log in normally, finish "Get started", create one
  circle, save 1–2 items. The suite then has stable data to exercise.
- The suite deletes what it creates (circle lifecycle ends in delete).

## CI
On every push, GitHub Actions runs ONLY the public specs (login screen +
respond page) — there is no human in CI to paste a login code. The
authenticated specs self-skip without a session. Full coverage = the local run.

## Never automated
Real outbound WhatsApp sends (would fire real messages + burn Meta quota).
