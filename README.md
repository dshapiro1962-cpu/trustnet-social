# Trustnet Social

Recommendations from people you actually trust.

## Layout
- `web/` — the app (`index.html`) and public respond form (`respond.html`). Netlify serves this folder; every push to `main` deploys automatically.
- `supabase/functions/` — edge functions. Pushing changes here auto-deploys them via GitHub Actions (see `.github/workflows/deploy-functions.yml`).
- `supabase/sql/` — migrations, applied manually in the Supabase SQL editor (0001–0010 already applied).
- `simulation_suite/` — the pre-export test harness. Every app change must pass all suites before deploy.

## The rules
- The app version marker (`APP_VERSION`) is bumped on every change; the sidebar footer reads it directly.
- App file: zero backticks, zero inline handlers; verified by parse check + sims.
- Live app: https://trustnetsocial.netlify.app  ·  Supabase project: kgsdtfrcyjrxeyqqxoic
