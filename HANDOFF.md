# TRUSTNET SOCIAL — SESSION HANDOFF BRIEF
Written 15 Jul 2026 · lives in the repo as HANDOFF.md · supersedes the 14 Jul brief

## USER & WORKING STYLE
- dan, non-technical, Windows + Hebrew locale. Step-by-step instructions,
  screenshots as evidence, Meta/Facebook UI guidance in HEBREW.
- App login: dshapiro8@hotmail.com. Gmail dshapiro1962@gmail.com = GitHub /
  Resend / OpenAI / Google accounts. dshario8@hotmail.com (no "p") is a REAL
  second address (member "dan test1") — NOT a typo.
- Second real user: naama (naama.ritte@gmail.com), member of dan's circles,
  linked. Tests run across two laptops.
- HARD RULES: on any bug report Claude analyzes/debugs/SIMULATES autonomously
  and returns only with proven fixes. Error messages surfaced verbatim.
  Every artifact carries a version marker (see invariants). Commands go
  through Notepad first. Docker Desktop needed only for manual supabase
  deploys (rarely needed now — CI does it).

## THE NEW WORKFLOW (since 15 Jul — replaces ALL drag-and-drop)
- Repo: https://github.com/dshapiro1962-cpu/trustnet-social (PRIVATE — verify;
  was created public and dan was told to flip it)
- Local clone: `%USERPROFILE%\OneDrive\Documents\trustnet-repo`
- Claude hands dan a file → dan saves it into the right repo subfolder → then:
  ```powershell
  cd "$env:USERPROFILE\OneDrive\Documents\trustnet-repo"
  git add . ; git commit -m "what changed"
  git push
  ```
- web/ changes → Netlify auto-deploys (project trustnetsocial, publish dir
  `web` via netlify.toml). supabase/functions/** changes → GitHub Actions
  deploys all functions (workflow deploy-functions.yml; secret
  SUPABASE_ACCESS_TOKEN set; whatsapp-webhook gets --no-verify-jwt; manual
  trigger available via workflow_dispatch). First CI run: green, 35s.
- NETLIFY LINK GOTCHA (burned once): Netlify was accidentally linked to a
  wrong, similarly-named repo ("trustnetsocial", no hyphen). It was to be
  DELETED on GitHub — verify it's gone. A real Git deploy shows its commit
  message in the Deploys list; "No deploy message" = suspicious.

## LIVE INFRASTRUCTURE
- Supabase project kgsdtfrcyjrxeyqqxoic (https://kgsdtfrcyjrxeyqqxoic.supabase.co)
- App: https://trustnetsocial.netlify.app — v0.16.1 live, deployed FROM GIT.
- Functions all live and repo-matched via CI (12): send-query (engine
  send-query-v5-strip: dual doorway, self-guard, per-member deliveries,
  WA_TEMPLATE env dial), resend-member (v1, new), ingest-link (v2, og:image),
  whatsapp-webhook (wawh-v3-image: wa_status logging + og:image),
  classify-rec, build-sheet, search-library, receive-response, response-meta,
  check-similar-query (LIVE for the first time — was dark), check-reciprocal,
  taste-matches, update-taste-match. _shared/: utils.ts, channels.ts.
- Migrations: 0001..0009d + repair_rec_origins applied to DB; 0010_image_url
  applied 14 Jul. REPO ONLY HAS 0001 + 0010 — files 0002..0009d were lost in
  a Claude workspace wipe (DB unaffected). To-do: regenerate from DB schema.
- Domain trustnetsocial.com on Cloudflare (NOT attached in Netlify domain
  management — investigate how it's wired when relevant); Resend via
  send.trustnetsocial.com; SMTP key "trustnet-auth" in Supabase SMTP; app
  email key "trustnet-main-2" (RESEND_API_KEY).
- Meta app Trustnetsocial (ID 1722975135708636), WHATSAPP_PHONE_ID=
  1157336944136920, system user trustnet-backend with a NEVER-EXPIRES token
  (rotated 14 Jul, confirmed working). Webhook verified + subscribed.
- Secrets: APP_URL, OPENAI_API_KEY ("Trustnet1"), OPENAI_MODEL=gpt-4o,
  GOOGLE_PLACES_API_KEY, RESPONSE_FORM_BASE_URL, RESEND_FROM_EMAIL,
  SEARCH_MIN_SIMILARITY=0.4, WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN,
  RESEND_API_KEY, and NEW: WA_TEMPLATE (optional; defaults to
  trustnet_query_v1 — switch to v2 with one `supabase secrets set`, no
  redeploy).

## SECURITY INCIDENT (14–15 Jul, RESOLVED, follow-up open)
trustnet_credentials_registry.txt sat inside the drag-deploy folder and was
PUBLICLY downloadable at /trustnet_credentials_registry.txt for an unknown
period. Fixed: file moved out of web folder, git deploy excludes it
(.gitignore blocks *credentials*), URL now 404 (verified).
OPEN: dan to list the key NAMES in the registry so still-live keys exposed in
it can be rotated (old Resend "trustnet" key already deleted pre-incident).
Registry file itself is STALE (05/07) and still needs its update pass —
keep it OUT of the repo and OUT of web/.

## CURRENT APP STATE (v0.16.1 · live, confirmed)
UX queue tasks 4–7 ALL SHIPPED 14 Jul, plus a full audit:
- Delivery strip after send: per-member channel + status IN WORDS
  (sent/failed; ✓✓ remains RESERVED for corroboration), failed rows show
  verbatim error + "add email + Resend" (resend-member endpoint, reuses the
  response token). wa_status webhook logging exists to feed real delivered
  states later (not yet wired into the strip).
- Triage tray ("NEEDS FILING") atop Library for circle-less saves (WhatsApp
  forwards): suggested circle chip pre-highlighted by domain match (no
  tinder-swipe), one tap files. og:image thumbnails on canonicals
  (image_url column, 0010) captured by ingest-link + whatsapp-webhook;
  thumbnails render on library cards.
- Library polish: per-category colored chips (CAT_HUES — first taste of
  Signal v2 hues), category filter tabs, semantic-search shimmer that
  settles into "✨ matched by meaning" tags on semantic-only hits. The three
  duplicated filter paths were unified into libFilterRecs/libResultsHtml.
- Onboarding: 3-step checklist + SVG progress ring on Home (circle → invite
  link inline → first ask; gated progression; disappears when complete;
  hidden in demo mode).
- Audit fixes: removed duplicate Ask button on Home (ask box is the one
  verb); save-to-library now PERSISTS saved_to_library (was memory-only —
  heartbeat resurrected the button) + re-renders from history view; dead
  Profile toggles (Taste Matching, Degree 2) replaced with honest "Always
  on · controls coming soon" labels.
- Version marker: sidebar footer element #app-version-footer is SET FROM
  APP_VERSION by JS at boot (single source of truth) after the 14 Jul
  incident where only the const was bumped and a stale static footer caused
  a multi-hour false "deploy not live" hunt.

## SIMULATION SUITE (simulation_suite/ in repo — REBUILT, old one lost)
- strip-sim (16), tray-sim (13), lib-sim (11), onb-sim (10),
  screens-sim (17: renders EVERY screen w/ fixtures; duplicate-id,
  undefined/NaN leak, action↔handler cross-check). All green at v0.16.1.
- Harness pattern: vm sandbox + DOM/supabase stubs; append exporters for
  const bindings; window.supabase must be stubbed; sb chain stub must be
  awaitable but NOT resolve synchronously in screens-sim (sync resolution
  triggers real renderApp → crash).
- Run: node simulation_suite/<x>-sim.js after extracting the app script
  (each sim reads /home/claude/sim/app_script.js — extract from index.html
  first; see any session transcript).

## OPEN THREADS
 1. REGISTRY ROTATION — see security incident above. Names pending from dan.
 2. IMPOSTOR REPO — confirm "trustnetsocial" (no hyphen) repo was deleted on
    GitHub; confirm trustnet-social is PRIVATE.
 3. WHATSAPP GONE SILENT (14 Jul afternoon): bot stopped replying to dan's
    inbound messages during triage-tray testing; dan suspected daily cap.
    Diagnostic queued: Functions → whatsapp-webhook → Logs — if the inbound
    event appears, bug is ours; if absent, Meta-side (test-number caps).
    Send path (outbound query sends) was confirmed working same morning.
 4. TEMPLATE trustnet_query_v2 (Utility): dan was instructed to create it
    (v1 is MARKETING → silent per-user frequency caps, matches historic
    symptom). STATUS UNKNOWN after 4+ asks. When approved:
    `supabase secrets set WA_TEMPLATE=trustnet_query_v2` — done, no redeploy.
 5. MIGRATIONS 0002..0009d missing from repo — regenerate from live schema
    (pg_dump or dashboard) for completeness.
 6. Email deliverability loose end (pre-existing): differential
    Hotmail-vs-Gmail direct-send test never reported; suspected Microsoft
    filtering of young domain for dshario8@hotmail.com; safe-senders remedy
    documented in an earlier session.
 7. Cloudflare/custom domain wiring unclear (domain not attached in Netlify).
 8. favicon 404 (console noise) — 2-minute fix someday.

## ROADMAP (approved order, UX queue 1–7 done)
 A. Supabase Realtime: sub-second push replacing 60s heartbeat.
 B. Delivery strip phase 2: wire wa_status delivery verdicts into real
    "delivered" states (strip already renders the word).
 C. Answer Sheet phase 2: shareable sheet/collection links ("Collections" —
    the Istanbul artifact; library-is-the-answering-engine principle LOCKED).
 D. Feed wiring for circle-less WhatsApp saves post-triage.
 E. Signal v2 reskin: preferred STRUCTURE = trustnet_ux_mockups.html,
    SKIN = Signal v2 WITHOUT emojis (SVG icons, initial tiles in category
    hues, tick grammar). DESIGN FILES WERE LOST in the wipe — regenerate
    first. CAT_HUES in the app is the seed.
 F. Taste Match v2 on embeddings; "unlock Taste Match" onboarding framing
    deferred to this.
 G. WhatsApp production number + business verification when >5 recipients
    (naama's real number can't receive WA yet — not a verified recipient).
 H. Staging: Netlify branch deploys (repo makes this trivial now).
 I. Grounding fine-tuning (parked by dan: "still not perfect but leave it").
 J. Registry update pass; stray test-account cleanup; invite-member function
    (never deployed; app add-member works without it).

## ENGINEERING INVARIANTS (enforce every session)
- App file: ZERO backticks, ZERO inline onclick/onerror; node vm parse check
  + FULL sim suite green before every export. Python anchored-replace
  scripts with count==1 asserts for all edits (watch emoji encodings in
  anchors — use literal emoji).
- Version: bump APP_VERSION every app change; static footer text kept in
  sync too (JS override makes it safe but keep both). Functions carry an
  ENGINE const + engine field in responses where applicable.
- Function edits: tsc --noEmit --skipLibCheck --target es2022 --module
  esnext --moduleResolution bundler --allowImportingTsExtensions (filter
  Deno noise); typescript in /tmp/node_modules; typecheck stubs for
  _shared/* exist in the session pattern (json() takes optional status!).
- Name collisions: the app already has catChipHtml(can, rec) for classify
  chips — new helpers must grep for existing names first (screens-sim's
  action↔handler check catches orphaned buttons).
- /home/claude RESETS between sessions: **restore working copies from the
  GIT REPO** (ask dan to upload nothing — pull files from
  raw.githubusercontent.com is NOT possible for private repos via fetch
  tool; have dan upload the specific files needed, or work from
  /mnt/user-data/outputs if same-day).
- Claude's web_fetch tool CACHES trustnetsocial.netlify.app aggressively —
  NEVER trust it for deploy verification. Ground truth = dan's PowerShell:
  Invoke-WebRequest + regex APP_VERSION (pattern in transcripts), plus the
  Netlify deploy's commit message.
- Adapter facts: responses = responded_at-only; fields recName/recNote/
  recLoc/respondedAt/contactId; contact_method lives on members; queries
  embed MUST be query_responses!query_id(*); notifications columns include
  response_token, query_id, actor_name, circle_id; types in use: query,
  query_response, pick_won, invite_accepted. canonicals now has image_url.
- Netlify dedup: unchanged bytes → "All files already uploaded" and no new
  upload; when in doubt force new bytes (version bump does it).

FIRST MESSAGE OF NEW CHAT SHOULD: pull open threads 1–4 status, then resume
the roadmap at A (Realtime) unless dan redirects.
