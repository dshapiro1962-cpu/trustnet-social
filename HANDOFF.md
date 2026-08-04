# TRUSTNET SOCIAL — SESSION HANDOFF BRIEF
Written 4 Aug 2026 · lives in the repo as HANDOFF.md · supersedes 28 Jul

## ⚠ FIRST THING IN A NEW CHAT
The app is at **v0.35.0** and everything below is deployed unless marked otherwise.
**There is ONE OPEN BUG (see "OPEN NOW"): dialog boxes are still not positioned
right on dan's iPhone.** Do not start anything else until that is settled, and
**ask dan for a screenshot of the dialog first** — we burned an entire evening on
it reasoning about a screen we could not see, and every CSS-only theory failed.

## USER & WORKING STYLE
- dan, non-technical, Windows + Hebrew locale, ~64, **iPhone daily-driver**.
  Step-by-step; screenshots as evidence; third-party UI guidance live-verified.
- Accounts: app login dshapiro8@hotmail.com · dshapiro1962@gmail.com =
  GitHub/Resend/OpenAI/Google · dshario8@hotmail.com = 2nd real address ·
  naama.ritte@gmail.com = 2nd real user · **dshapiro3012@gmail.com = E2E test
  account**. Founder block: Dan Shapiro · Founder · +972-50-5543402.
- HARD RULES:
  1. CHECK / DEBUG / SIMULATE before presenting. Say proven / unproven / untested.
  2. Systems only dan can see → ONE diagnostic extracting full state.
  3. FULL direct URLs and paths. 4. PDFs stamped with the verified version.
  5. Errors verbatim; version markers everywhere. 6. Non-ASCII via code blocks.
  7. Config-before-behavior. 8. No secrets/tokens in chat (they expire hourly).
  9. **REDESIGN, don't patch, when a problem reveals structural weakness.**
 10. **OBSERVABILITY IS A FEATURE** — every failure path surfaces the real error.
     Most bugs found on 28 Jul were silent failures wearing a success message.
 11. **NEW (3 Aug) — NEVER fix a component problem with a page-wide setting.**
     `viewport-fit=cover` was added to fix a modal; it woke dormant `env()`
     padding and doubled the mobile tab bar. Three tests now guard this.
 12. **NEW — enumerate what a screen already DOES before rebuilding it.** Two
     redesigns removed features dan relied on (collections strip, invite form).

## THE RITUAL
Repo github.com/dshapiro1962-cpu/trustnet-social · local C:\dev\trustnet-repo
```
cd C:\dev\trustnet-repo
git add . ; git commit -m "..."
git push
robocopy C:\dev\trustnet-repo "$env:USERPROFILE\OneDrive\Documents\trustnet-backup" /MIR /XD .git /NFL /NDL /NJH /NJS
```
web/** → Netlify · supabase/functions/** → GitHub Actions.
**Deploy gotchas that cost real time:** `Expand-Archive -Force` overwrites but
never DELETES (ghost files linger — `Remove-Item …\tests -Recurse` first);
**always verify the version marker on disk after extracting**; many cycles were
lost to "nothing to commit" because a zip was never downloaded. Regenerate
`sim/app_script.js` from index.html after EVERY edit or sims test stale code.

## LIVE INFRASTRUCTURE
- Supabase **kgsdtfrcyjrxeyqqxoic** · https://trustnetsocial.netlify.app
- **PRODUCTION WHATSAPP COMPLETE** — +972 58-778-6049 · WABA 2252335755587692 ·
  Phone ID 1156461904225155 · 2FA 462013 · verify token trustnet-verify-2026 ·
  template trustnet_query_v2 ACTIVE. Inbound + outbound both proven.
- Secrets: OPENAI_API_KEY (Trustnet2), OPENAI_MODEL=gpt-4o, GOOGLE_PLACES_API_KEY,
  WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, RESEND_API_KEY,
  WA_TEMPLATE, APP_URL, RESPONSE_FORM_BASE_URL, RESEND_FROM_EMAIL,
  SEARCH_MIN_SIMILARITY=0.4. Optional: LIBRARIAN_MODEL, RERANK_MODEL.
  SUPABASE_SERVICE_ROLE_KEY ships by default (adminClient uses it).
- Migrations applied: 0001–0013, **0014_librarian, 0015_hybrid_fix,
  0016_link_existing_member, 0017_phone_identity**.
- ⚠ classify-rec no longer exists (404) — the Librarian replaced it.

## APP STATE — v0.35.0 · respond r2.4-lib · **392 checks green, 24 sim suites**
Suites: modalfit · wa-signin · matrix · invite · libui · corpus · rls · librarian ·
search · archetype · sheet · respond · editdel · contacts · chatimport ·
collections · links · login · screens · onb · lib · tray · strip · collection-page.

### The memory layer (25–31 Jul) — "the Librarian"
Root problem: "Avoriaz 1800" was saved from a ski circle with the word **ski
nowhere in the record**, so "good ski resort for children" could never match it.
- **`librarian` fn** — ONE enrichment service (modes enrich / commit / backfill
  {force,offset}). Resolves the entity (AI + Google Places), assigns category,
  kind and **context-bearing tags**, and writes a **SEARCH DOCUMENT**:
  name · kind · location · category · tags · note · "asked: <question>" ·
  "circle: <name>". Backfill repairs existing items; `force:true` rebuilds all.
- **`search-library` fn (search-v2)** — hybrid recall (trigram ∪ vector) then an
  **LLM rerank for intent**. Two rules learned the hard way: an entry that
  ANSWERED a question mentioning the search term IS relevant (searching
  "la grave" returns the resorts your circle suggested); and it **never returns
  an empty screen** when strong matches exist (falls back, flagged `fell_back`).
- **0015 fixed a fatal flaw**: `similarity(doc, query)` compares the WHOLE
  document, scoring ~0.01 always — the keyword half of hybrid search was dead.
  Now `word_similarity(query, doc)` + exact-substring bonus (1.0 vs 0.114).
- **Save paths wired**: per-response save and sheet save both call librarian
  (`enrich` then `commit`), and **merging a comment re-commits** so an item grows
  richer. ⚠ **The triage tray and chat-import still create canonicals the OLD
  way** — they will reintroduce impoverished items. Not yet done.

### Answer sheet archetypes (28 Jul, sheet-v4.1)
`build-sheet` classifies the QUESTION: **discovery** (answers name the entities) ·
**verification** (one named subject; answers are verdicts) · **comparison**
(2+ subjects, a card each) · **advice** (prose, its own section). Also a
**reference** concept: "similar to La Grave", "alternative to Santorini",
"books by the Harry Potter author" — the named thing is the search key and is
excluded from results. Each ANSWER is targeted at the subject it names; answers
naming none become General Comments. **Hard rule: a sentence must never become a
canonical** (`looksLikeSentence` guard, tested on dan's real answers).

### Retrieval eval — the "perfect" bar made measurable
`eval/eval-questions.txt` (28 pairs from dan's own 20-question corpus),
`eval/eval-retrieval.js --token <t>`, `eval/load-corpus.js --token <t> [--dry|--clean]`.
**Last score: 26/29 found in top 5 (90%), 16/29 at #1, avg rank 1.54.**
Remaining misses: one item never created; one advice pair correctly not saved.
The eval found a real bug on day one (merges not refreshing the catalogue entry).

### WhatsApp identity (3 Aug) — v0.34.0
Signup was email-only and **no account had a phone**, so phone matching was
impossible. Now: **`wa-signin` fn** (start/verify) sends a 6-digit code over
WhatsApp from the production number; codes hashed, 10-min expiry, 5 attempts,
60s cooldown, 5/hour, and **identical responses either way** so it cannot probe
who is registered. Uses its own admin client with `persistSession:false`.
**0017** adds a canonical `phone_key` (last 9 digits) on users + `contact_key` on
members as GENERATED columns, `wa_otp`, and — importantly — **`resolve_contacts`**
and **`refresh_member_links`**.
**NO-STALE-DATA PRINCIPLE (dan's instruction):** no decision may come from a
stored answer the database can answer now. Linkage is resolved at view time and
when a contact is typed; `linked_user_id` survives only as a server-side cache.

### Invite screen (2–3 Aug) — v0.32–v0.33
Was a mock (`send-invite-sim`, dead buttons, a designer's note shipped to users).
Now: **INVITE SOMEONE NEW** (WhatsApp/Email + contact field, local phone formats
accepted) · **your members grouped** (already on Trustnet / not yet, one-tap using
their stored contact / no contact details) · **Copy invite link**. All feedback
appears **inline beside the form** and scrolls into view, colour-coded (green =
already on Trustnet, blue = on Trustnet but not in this circle → add them, red =
error). The full member/circle/Trustnet matrix is enumerated and tested
(`matrix-sim`, 27 checks) incl. cross-circle reuse, self-add by phone, relink on
edit, duplicate guard across phone formats.

### Phone UI (1–3 Aug)
Library header is phone-first: **search + "Needs filing (n)" + circles**;
collections strip, tray and category tabs fold behind toggles. Shell-level
overflow guards (no horizontal swipe). Squeezed flex rows fixed app-wide.
**Modals: ONE scroll container** (body flexes; header/footer fixed), scroll
shadows + a "more below ↓" pill, and **v0.35.0 centres modals inside an overlay
PINNED to the visual viewport by JS** (`sizeModalToViewport`, tracks
visualViewport resize AND scroll, falls back to innerHeight).

## 🔴 OPEN NOW — the one live problem
**Dialog boxes are still not positioned correctly on dan's iPhone**, worst for
the green **+** menu (second option nearly off-screen). History of failed fixes,
so do NOT repeat them: (a) max-height in vh — iOS counts toolbars; (b) `dvh` —
needs 15.4+; (c) `viewport-fit=cover` + safe-area — **broke the app, doubled the
tab bar**; (d) bottom-sheet anchoring — anchors to a bottom hidden behind
Safari's toolbar; (e) v0.35.0 centring + JS-pinned overlay — **dan has not yet
confirmed** (he tried to send a screenshot and hit the chat limit).
**NEXT STEP: get a screenshot of an open dialog on his iPhone before writing any
more CSS.** If v0.35.0 still fails, suspect something outside the modal CSS
entirely (e.g. `#app { height: 100vh; overflow: hidden }` interacting with the
fixed overlay) and instrument rather than theorise.

## OTHER OPEN THREADS
1. Route the **triage tray + chat-import** save paths through the Librarian.
2. Beta readiness manual checks (fresh-day cold inbound · full cross-account
   human loop · chat-import from a phone · naama pass · Android picker ·
   WhatsApp quality glance · Defender exclusion) → **name the first 3–5
   connectors + start date + feedback channel** (the real bottleneck).
3. HARD-THINK parked: chat-import **phone numbers** (a rec with no contact is
   dead unless it has a strong identity anchor); E2E 07 member-save race.
4. Regenerate trustnet_user_manual.pdf and trustnet_beta_readiness.pdf to v0.35.
5. Post-beta: **trip/itinerary link import (global, source-agnostic)** · Realtime
   push · delivery strip phase 2 · Taste Match v2 · native wrapper evaluation.

## BETA POSITION (dan's framing — important)
**Beta cannot be size-limited.** He controls only the first ring; everyone past
it arrives cold and unforgiving, and success IS spread. Main features must be
*perfect*: ask → answer → save · library retrieval · answer-from-library ·
collection sharing · the answerer's no-app experience. Rough edges are acceptable
only where a stranger never goes.

## REVENUE (trustnet_lean_canvas.pdf) — a sequence, not a menu
1. Affiliates (needs VOLUME; most recs are local services with no programs —
   may be the wrong stream; never influence WHAT is recommended). 2. Subscriptions
(needs ENGAGEMENT; the curator pays). 3. **Professional page ownership** (needs
DENSITY, FUTURE): a pro claims their page to keep FACTS live and may push
structured updates only to people who already hold them. Buys facts and
freshness, **never visibility or ranking**; strict verification from day one.

## E2E (Playwright, /e2e) — 36 tests
Paste-the-code login in global-setup (MAIN process — workers can't read stdin),
session saved and **re-captured every run**. CI runs public specs only.
`cleanup-e2e-circles.js` removes test debris.

## KAEDAN & DOCS
Trigger: **"run the Kaedan simulation"**. PDFs in outputs: founding_engineer ·
lean_canvas · beta_readiness · user_manual (stale). Recruiting WhatsApp message
drafted (opens "Trustnet", keeps *pre-seed* and *Social Intelligence Platform* in
English to avoid Hebrew bidi flips).

FIRST MESSAGE OF A NEW CHAT: paste this file, then ask dan for the iPhone dialog
screenshot (see OPEN NOW). The product is live and the memory layer is rebuilt;
what remains is one positioning bug, then people.

# ═══ 4 AUG 2026 — v0.36.0 · SESSION ADDENDUM (supersedes contradicting lines above) ═══

## CLOSED: the iPhone dialog bug (v0.35.1) — was STACKING, not geometry
Overlay z-index 100 vs tab bar 900: the bar and its + button PAINTED OVER every
dialog's bottom. All five geometry fixes were aimed at the wrong thing; v0.35.0's
JS pinning was working the whole time. Fixed with an explicit LAYER SCALE
(documented in web/index.html): tabbar 100 · modal 1000 · onboarding 1100 ·
login 1200 · loading 1300 · toasts 9999. Rule: full-screen layers NEVER share a
z-index (DOM order silently decides ties — that's how the bar covered the login
screen). 9 stacking guards in modalfit-sim. Confirmed on dan's phone.

## CLOSED: v0.35.2 — phone modal reserves the home-indicator strip
The stacking bug had been HIDING that nothing reserved env(safe-area-inset-bottom)
inside modals; once dialogs reached the true screen bottom, the last row of a long
list landed under the home indicator (dan runs Trustnet from a home-screen icon,
so the inset is live ~34px). Component-scoped padding on .modal; longlist-sim
proves 60-member circles scroll with one scroller and no truncation.

## CORRECTION: classify-rec was NEVER dead — and CI resurrects deleted functions
Earlier note "classify-rec 404s, replaced by the Librarian" was WRONG. It was
deployed (redeployed 3 Aug by the GitHub Action from repo source), last invoked
31 Jul. Its 5 final items: category set, NO search_doc — looked classified,
invisible to search. **FOOTGUN THAT OUTLIVES THIS FIX: the deploy Action
redeploys everything under supabase/functions/**; deleting a function from the
dashboard alone does NOT kill it. Delete the source directory too.**

## v0.36.0 — ONE ENRICHMENT PATH (the choke point)
Before: librarian, classify-rec, and whatsapp-webhook embedded THREE different
texts; chat-import embedded nothing; edit-note and triage-file mutated values
that live INSIDE search_doc without re-committing (7 stale docs in prod — the
Avoriaz failure mode returning through the side door).
Now:
- **Client**: `librarianCommit()` in web/index.html is the ONLY committer —
  exactly one `mode:'commit'` call site may exist (enrichment-sim enforces the
  count). requestClassify kept its name/signature/UI states but routes through
  it. Gate is **search_doc presence, not category** (category-gating stranded
  the 5). Edit-rec and triage-assign re-commit with force:true. Classified-but-
  unindexed items self-heal silently on view.
- **Server**: enrichment core EXTRACTED (not copied) to
  supabase/functions/_shared/enrich_core.ts; librarian imports it;
  extract-chat-recs and whatsapp-webhook now write search_doc + embed THE
  DOCUMENT at insert. buildSearchDoc exists in exactly one file.
- classify-rec: deleted from repo package; call site removed; MUST also be
  deleted in the dashboard (see deploy steps).
Suites: 26/26 run, 448 checks green (enrichment-sim 35 incl. negative-tested
choke-point guard; librarian-sim drift guards now read librarian+core).

## PROD DATA STATE (measured 4 Aug, dan's SQL)
115 items · 5 missing search_doc (classify-rec's last victims — self-heal on
view) · 7 docs missing their circle name (stale; backfill SKIPS them because a
doc exists — null their search_doc once, see deploy steps) · 0 note-stale ·
0 vector/doc disagreement (the two systems dodged corruption by luck: classify
bailed when category was set, librarian always set it).

## KNOWN GAP: migrations 0002–0009 absent from the repo
supabase/migrations has 0001 then 0014+; supabase/sql has 0010–0013. Eight
applied migrations exist only in the database — the repo cannot rebuild it from
scratch. Not urgent; belongs on the list before beta.

## SESSION RULES (dan, 4 Aug — carry into every future chat)
1. ANALYSIS FIRST: write the diagnosis, then attack it (alternative causes,
   unverified assumptions), then WAIT for dan's go before building.
2. BUILD → TEST → DEBUG → only then submit. Test the DELIVERABLE itself
   (extract your own zip, diff the file set) — and negative-test new guards:
   a check that can't fail isn't a check.
3. NO PATCHING when structure is wrong — rewrite. Tension with rule 12
   resolved: enumerate current behaviour first, carry every item deliberately.

## NEXT (after v0.36.0 deploys): triage tray + chat-import UX, then beta
readiness → first 3–5 connectors.

# ═══ 4 AUG 2026 (evening) — v0.37.0 · PRODUCT LAW: PROVENANCE ≠ EVIDENCE ═══

## THE LAW (dan, verbatim intent — supersedes 0014's design)
Circles and categories are the USER'S FILING, not content. The card may show
"from ski circle" (client reads rec.circleId — display never came from the
search doc). But retrieval — the search document, tags, embedding, reranker
evidence — must be BLIND to them: a Milano hotel discussed in the ski circle
is a Milano hotel. Only the item itself, the question asked, and the answers
given are searchable. The question stays in the doc ("is Avoriaz a good ski
resort" keeps Avoriaz findable by "ski" — that is content, not filing).

## WHY (the post-mortem that forced it)
The 0014 design wrote "circle: <name>" into every doc and told the enricher to
inject circle words into tags. Filed-in-ski items (a dermatologist, two BBQ
grills, Basta) therefore LITERALLY contained "ski": exact_bonus=1.0 in the
hybrid RPC, tag "ski" in the client. The GPT reranker correctly rejected them
— but the library screen UNIONED a local substring scan (name+note+TAGS+
categories) with the reranked ids, re-injecting everything the reranker had
thrown out ("whiskey" contains "ski"; "skin" contains "ski"). Weeks of junk
results, misdiagnosed twice (as DB corruption, as seed data) before the two
mechanisms were separated. v0.36.0's triage re-commit hook was built to serve
the OLD law and is now DELETED — refiling is pure metadata.

## WHAT CHANGED
- enrich_core: buildSearchDoc drops circle AND category; enrichment prompt
  forbids circle-derived tags ("NEVER from which circle"); circle_name removed
  from every signature. Librarian ignores client-sent circle_name.
- librarian backfill: no longer fetches circle names (question text still is).
- extract-chat-recs / whatsapp-webhook: circle-blind.
- Client librarianCommit/requestClassify: no circleName. Edit-rec still
  re-commits (the NOTE is evidence). Triage-assign commits NOTHING.
- Library screen — ONE AUTHORITY: local arm is word-PREFIX on NAME/LOCATION
  only, and ONLY while the semantic result is in flight. Once reranked ids
  arrive for the exact query, they ARE the result set; empty verdict shows
  empty ("an empty answer beats a wrong one"). No union, ever.
- Guards: searchdisplay-sim (15 checks incl. Basta/whiskey/skin/Hebrew
  fixtures); buildSearchDoc body must be 100% circle-free (STRUCTURAL check —
  the first literal-string version passed while "circle: ski" sat in the doc;
  extraction is index-based because a lazy regex captured only the signature);
  search-sim's two union-era checks deliberately flipped. 466 checks / 27
  suites green; both negative tests proven to bite.

## DEPLOY REQUIRES A ONE-TIME RE-ENRICHMENT
Every pre-v0.37.0 doc and tag set is circle-contaminated. After deploying,
run from the app console: fnPost('librarian',{mode:'backfill',limit:100,
force:true}).then(console.log)  (~70 GPT-4o+embed calls, a few minutes, dan's
account only). Then verify: select count(*) from canonicals where search_doc
ilike '%circle:%';  → must be 0.

## STILL OPEN (next sessions)
- Chat-import name-dedup hole: "שושן-שמוליק" vs "שושן שמוליק" — a hyphen
  defeats it (produced the Aug-2 duplicate pairs dan deleted by hand).
- Shared-canonical display dedupe (Silverton showed twice) — product call.
- Migrations 0002–0009 still absent from the repo.
- Test-account debris: 5 doc-less canonicals under test users — harmless.
