# Trustnet E2E v3 (Playwright) — setup-project auth

Real-browser tests against the DEPLOYED app. A dedicated "setup" project logs
in FIRST (paste the emailed 6-digit code once); every browser project depends
on it and reuses the saved session (.auth/session.json) until it expires.

## Full run (local, before releases)
```powershell
cd C:\dev\trustnet-repo\e2e
npm install                                   # first time only
npx playwright install --with-deps chromium   # first time only
npx playwright test                           # pauses for the code only when needed
npx playwright test --headed                  # watch the browser click
npx playwright show-report
```

## Test account
test-account.json → dshapiro3012@gmail.com. Onboard it once by hand
(one circle + 1–2 saved items) so library specs have data.
The circle spec cleans up after itself (create → edit → delete).

## CI
GitHub Actions runs ONLY the `public` project (login screen + respond page):
no human in CI to paste codes. Full coverage = the local run.

## Never automated
Real outbound WhatsApp sends.
