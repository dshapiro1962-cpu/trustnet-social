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

# ═══ 5 AUG 2026 — v0.38.0 · GROUPED CARDS (one card per place) ═══

## THE IDEA (dan)
Silverton answered three questions from three circles ("similar to la grave in
the USA", "most extreme freeride resort in the USA", "a resort with no groomed
and marked runs"). Typing Silverton must show ONE card carrying all three
reasons. Three people answering three questions with one place is the PRODUCT,
not a duplicate — the schema always intended it (canonicals = the thing,
recommendations = someone's take, each with its own note/circle/query/rater;
no unique constraint on canonical+owner).

## RULES AS BUILT
- One card per CANONICAL. The lead recommendation supplies note/rating/status.
- LEAD: reranker ruled -> highest-ranked (f.filtered is already in rank order,
  so first occurrence = the question that MATCHED). No ranking -> most recent
  by created_at. NOT rec_date: import days tie, and a label that flips between
  refreshes is maddening to debug.
- CIRCLE LABEL: most recent take's circle, rendered "travel +2" when the group
  spans others. The +N exists so a self-changing label never reads as data loss.
- QUESTION LINE: the lead's question, plus "answered N more questions".
- DETAIL VIEW: every distinct question, newest first, each with its own note
  and attribution. Uses allRecsForCanon — computed since v0.17, never used;
  the detail view had been showing whichever card you happened to tap.
- COUNT: cards, phrased "2 items · 4 recommendations" when they differ, so a
  smaller number is explained rather than alarming.
- Circle filter narrows the group: the ski view shows Silverton once with a
  bare "ski" label and NO phantom +N.

## DEFAULTS I CHOSE (dan didn't rule; each is one line to reverse)
count=cards · grouping across all circles always · detail newest-first.

## TESTS
grouped-sim.js — 23 checks on dan's exact Silverton fixture. Both negative
tests proven: reverting to per-rec cards fails 3 checks (3 Silverton
occurrences); breaking the recency rule fails the lead checks.
Suites: 28, checks 489, all green.

## NOT DEPLOYED YET at time of writing — needs the usual: extract, verify
v0.38.0 on disk, commit, push, hard-refresh.

# ═══ 5 AUG 2026 — v0.39.0 · CHAT-IMPORT DEDUP ═══

## TWO FAULTS, ONE OF THEM WORSE THAN THE REPORTED ONE
1. Dedup was an EXACT name match (lowercase+trim). One hyphen defeated it —
   "שושן שמוליק" vs "שושן-שמוליק" — producing the 2 Aug duplicate pairs.
2. THE DEEPER ONE: chat-import NEVER called match_canonical. It minted a fresh
   canonical for EVERY import, fragmenting the entity graph. Since v0.38.0
   groups cards BY CANONICAL, two canonicals for one place = two cards no
   grouping can merge. This was not in the original bug report.

CORRECTION to an earlier claim in this handoff: `have.add(norm)` WAS inside the
loop, so within-batch identical-spelling repeats were already handled. The real
gaps were variant spellings and the missing canonical reuse.

## AS BUILT
- match_canonical (trigram > 0.45) is called FIRST — same RPC receive-response
  has always used. Matched -> reuse the canonical. Only an unmatched name mints
  a new one, and it is inserted immediately, so a variant spelling later in the
  SAME batch is caught by match_canonical on its own turn (no local map).
- Rec-level skip key = canonical_id + source_label + note (dan's call).
  A: re-import same chat, same note -> skipped.
  B: different group, same place -> second take KEPT (a second person's take is
     a second RECOMMENDATION, not a duplicate — the schema always allowed it).
  C: same group, NEW note -> KEPT. Rationale: skipping a real recommendation is
     a SILENT loss; a visible duplicate can be deleted.
- Response now returns `reused` — a re-import should show high reuse, a fresh
  chat near zero. Cheap signal that dedup is alive.
- Still writes search_doc at birth (v0.36.0) and stays circle-blind (v0.37.0).

## THRESHOLD EVIDENCE (modelled, not measured — no DB in the build container)
Caught: שושן שמוליק/שושן-שמוליק 0.64 · Eli מיזוג/מזוג 0.58 · ד"ר X/דר X 0.69 ·
Tony Vespa/tony vespa 1.00. Correctly separate: Basta/Habasta 0.40 ·
K2/K2 Sender 0.30 · unrelated butchers 0.00. All far from the 0.45 boundary.

## K2 / K2 SENDER — RESOLVED WITHOUT CODE
A boot brand and a ski model are DIFFERENT things and must stay separate
canonicals. dan verified on live search: "K2" returns both; "ski boot" returns
only K2. exact_bonus (doc contains query -> 1.0, name overlap -> 0.9) links
them at retrieval time without merging them at data level. No change needed.

## TESTS
importdedup-sim.js — 27 checks incl. dan's real duplicate pairs and the three
scenarios. Negative tests proven: removing canonical reuse and reverting to the
name-only key both fail. Suites 29, checks 516, all green.

## NEXT: migrations 0002–0009 into the repo (schema cannot be rebuilt from
source today: source_label and shared_to_network exist in the DB but in NO
migration file). Then beta readiness → first 3–5 connectors.

# ═══ 5 AUG 2026 — v0.40.0 · SCHEMA RECONCILIATION (0002–0009 gap closed) ═══

## CORRECTION to an earlier claim in this handoff
I previously wrote that source_label exists in the DB but in NO migration.
WRONG — it is in 0012_collection_provenance.sql, which lived in supabase/sql/
rather than supabase/migrations/. I checked one folder and generalised. The gap
was real but the example was not.

## WHAT WAS ACTUALLY MISSING (diffed information_schema vs every migration)
THREE TABLES no migration created: public_lists, circle_invite_links,
category_corrections. NOTE: none are referenced by ANY code in the repo — they
look like abandoned features. Reconstructed for fidelity; consider dropping.
FIFTEEN COLUMNS: canonicals(primary_category, ai_tags, embedding,
classified_at, class_source) · invites(invite_type, circle_id, inviter_name,
circle_name, clicked, clicked_at) · queries(resolved_at, chosen_response_id) ·
recommendations(shared_to_network) · users(handle, share_by_default).
canonicals.embedding is the one that mattered: search_library_hybrid reads it
directly, so a rebuild produced a database where semantic search could not
work at all.

## A REAL ORDERING BUG THE NEW SIM FOUND
0014 declares vector(1536) in search_library_hybrid's signature, but pgvector
was only ever enabled BY HAND in the dashboard. A fresh rebuild died at 0014
with "type vector does not exist". Fixed by hoisting
`create extension if not exists vector;` into 0001 beside pgcrypto/pg_trgm.
Idempotent, so a no-op live. This is the class of failure the whole exercise
existed to find, and it was invisible until something tried to rebuild.

## AS BUILT
- 0018_schema_reconciliation.sql: all three tables + all fifteen columns, every
  statement `if not exists` — SAFE to run live, where it does nothing. It
  exists so a FRESH database can be built from source.
- supabase/sql/ MERGED into supabase/migrations/. One folder, one sequence.
- schema-sim.js (29 checks): every live table and column must be creatable from
  migrations; the AI/search columns get named checks; extension ordering is
  verified; and no code reference may point at an uncreatable column.
  Negative-tested three ways (drop embedding, un-hoist the extension, rename a
  table) — all three fail as they should.

## STILL NOT CAPTURED — READ BEFORE TRUSTING THIS FOR DISASTER RECOVERY
RLS POLICIES. The information_schema dump did not include pg_policies, so a
rebuilt database has these tables with RLS unconfigured. Capture with:
  select schemaname, tablename, policyname, cmd, qual, with_check
  from pg_policies where schemaname = 'public';
Foreign keys and CHECK constraints in 0018 are INFERRED from column names and
0001's conventions, not read from the live DB. Probably right; not verified.

## SUITES: 30, checks 545, all green.
## NEXT: beta. Every technical blocker is cleared. The gate is dan's decision:
## first 3–5 connectors, a start date, a feedback channel.

# ═══ 5 AUG 2026 — v0.40.0 · SCHEMA RECONCILIATION (0002–0009 gap closed) ═══

## THE GAP WAS WORSE THAN THE HEADLINE
Migrations 0002–0009 were run by hand in the dashboard and never committed.
Diffing information_schema.columns against every committed migration found
THREE TABLES and FIFTEEN COLUMNS existing only in production:
  tables : public_lists · circle_invite_links · category_corrections
  columns: canonicals.{primary_category, ai_tags, embedding, classified_at,
           class_source} · invites.{invite_type, circle_id, inviter_name,
           circle_name, clicked, clicked_at} · queries.{resolved_at,
           chosen_response_id} · recommendations.shared_to_network ·
           users.{handle, share_by_default}
canonicals.embedding is the vector column search_library_hybrid reads directly:
a rebuild produced a database where semantic search could not function at all.

## CORRECTION TO AN EARLIER CLAIM IN THIS HANDOFF
I stated source_label existed in the DB but in NO migration. WRONG — it is in
0012_collection_provenance.sql, which lives in supabase/sql/ rather than
supabase/migrations/. I checked one folder and generalised. shared_to_network
IS genuinely missing; source_label never was.

## A REBUILD-BLOCKING BUG THE NEW SIM CAUGHT
Nothing ever created the pgvector extension. 0014 declares vector(1536) and
would ABORT on an empty database with "type vector does not exist", killing
every later migration. Fixed by 0009_extensions.sql — numbered 0009, not 0018,
because ORDER is the point: correct SQL in the wrong slot still cannot rebuild.

## RLS: DELIBERATELY NOT RECONSTRUCTED
An earlier draft of 0018 INVENTED policies by inference. That was wrong and
dangerous — `drop policy if exists` + a guessed `create policy` would silently
replace a working production policy, either locking users out or exposing data.
0018 now only ENABLES RLS on the three new tables and stops: a no-op live, and
FAILS CLOSED on a rebuild. TO FINISH, run against prod and paste back:
  select schemaname, tablename, policyname, cmd, qual, with_check
  from pg_policies where schemaname='public' order by tablename, policyname;
public_lists especially needs a SELECT policy letting non-owners read published
lists (is_public = true), or sharing breaks entirely.

## STRUCTURE
supabase/sql/ MERGED into supabase/migrations/ — one folder, one sequence
(0001, 0009, 0010–0018). All statements are `if not exists`: 0018 is SAFE to
run against production, where it is a no-op.

## TESTS
schema-sim.js — 30 checks: every live table and column must be creatable from
migrations; extension ordering (with SQL comments STRIPPED — a check that
explanatory prose can break gets deleted the first time it cries wolf); no code
reference to an uncreatable column. Negative tests proven: deleting 0009, 0018,
or re-splitting the folder each fail. Suites 30, checks 546, all green.

## NEXT: beta. Every technical blocker is now cleared. The remaining gate is a
decision only dan can make — first 3–5 connectors, start date, feedback channel.

# ═══ v0.40.1 · RLS TRANSCRIBED (completes 0018) ═══

dan dumped pg_policies. Only THREE of eighteen production policies were missing
from the migrations: cil_owner (circle_invite_links), public_lists_owner,
notif_select. Now in 0019_rls_policies.sql, transcribed verbatim.

## THE INFERENCE WAS WRONG IN THE DANGEROUS DIRECTION — KEEP THIS LESSON
The earlier 0018 draft guessed public_lists needed a SELECT policy letting
anyone read a list with is_public = true. Production has NO such policy:
public_lists is OWNER-ONLY. Shared lists reach non-owners through the
get-collection edge function, which uses the SERVICE ROLE and bypasses RLS.
Shipping the guess would have opened direct client reads the product does not
grant. Guarded now: schema-sim fails if any public_lists policy mentions
is_public. NEVER reconstruct security rules by inference — dump them.

## category_corrections IS DEAD, DELIBERATELY DOCUMENTED
Table exists, RLS enabled, ZERO policies — and zero references in the app or
any of the 19 edge functions. RLS with no policy denies everything, so it is
dead weight, not a hole. DECISION (not urgent): wire it to the category-
correction flow so class_source='user' gets its audit trail, or drop it.

## STATE: suites 30, checks 550. Migrations 0001, 0009, 0010–0019 in ONE folder.

# ═══ 5 AUG 2026 — v0.41.0 · CONTACT AS A FIELD (parked HARD-THINK item closed) ═══

## THE PROBLEM, SHARPER THAN THE ORIGINAL NOTE
canonicals had google_url, website_url, linkedin_url — and NO phone. The only
phone columns in the database belonged to users and wa_otp (people who sign in).
So chat-import appended the provider's number to the NOTE as prose:
  "מעולה, אמין, מקצועי, אחראי. 050-5303690"
Three costs, the third unnoticed until now:
  1. NOT ACTIONABLE — read, select, copy, switch app, paste
  2. NOT QUERYABLE — "which recs are contactable" was unanswerable
  3. NOT AN IDENTITY ANCHOR — match_canonical compared NAME SIMILARITY only,
     so the strongest signal in the data sat unused inside a sentence.

## WHY BEFORE BETA (dan's correction, and he was right)
I proposed measuring current volume first. Wrong frame: volume-sizing is for
REPAIRING existing damage, not for structural capability before growth. This is
a schema-shape error — equally wrong at 6 rows and 6,000 — and the backfill is
trivial today and miserable later. Beta multiplies exactly the shape that needs
it (handymen, doctors, babysitters). Recorded because the instinct to measure
first is usually right and misfired here.

## AS BUILT (0020_canonical_contact.sql + code)
- canonicals.phone (raw, as written) + canonicals.phone_key GENERATED ALWAYS AS
  (phone_key(phone)) STORED — reuses 0017's immutable function, so there is ONE
  normalisation rule and no code path can write an inconsistent key. Indexed.
- match_canonical(p_name, p_location, p_phone DEFAULT NULL): PHONE IS CHECKED
  FIRST and returns immediately. A matching number is proof; a similar name is a
  guess. Two providers named "שי" with different numbers now stay separate; one
  provider written "שושן שמוליק"/"שושן-שמוליק" merges on the number even if the
  names drift past the 0.45 trigram threshold. Signature EXTENDED not replaced —
  receive-response and every other caller keep working untouched.
- Backfill lifts numbers already trapped in notes. Non-destructive: notes keep
  their text, and an existing phone is never overwritten.
- chat-import writes the phone as a COLUMN, passes it to match_canonical, and
  fills a REUSED canonical that has no number (never overwrites one). The search
  DOCUMENT still contains the number — searching a phone must find the provider.
  Retrieval text and stored fields are different concerns.
- Rec detail: tel: and WhatsApp buttons, FIRST in the link row — pressing beats
  searching. Uses normalizeIlPhone, the same rule as everywhere else.

## TESTS
contact-sim.js — 30 checks incl. five written forms of one number collapsing to
one 9-digit key, and dan's real "שי" ambiguity. Negative tests proven: removing
the phone short-circuit and re-gluing the phone into the note both fail.
Suites 31, checks 580, all green.

## DEPLOY: run 0020 in the SQL editor AFTER pushing. It ends with a verification
query — expect cols=2, match_fn=1, and phones_recovered = however many numbers
were rescued from notes.

# ═══ v0.41.1 · match_canonical OVERLOAD FIX (0021) ═══

0020's verification query returned pg_proc = 2, not 1. CREATE OR REPLACE only
replaces a function of the SAME SIGNATURE; adding p_phone created a SECOND
overloaded match_canonical rather than widening the original.

WHY IT MATTERED: Supabase RPC resolves by parameter NAME. receive-response calls
with two named args and PostgreSQL prefers exact arity — so it would have
silently kept using the OLD no-phone function while extract-chat-recs (three
args) used the new one. Two callers, two identity rules, no error raised. 0021
drops the 2-arg orphan; the 3-arg version is a strict superset (p_phone defaults
null, name/location branch byte-identical).

LESSON: 0020's comment claimed "signature EXTENDED, not replaced" — true in a
sense I had not thought through. It extended by ADDING a function. Any migration
that changes a function's argument list must DROP the old signature explicitly.
Guarded: contact-sim fails if the 2-arg drop is missing.

RUN ORDER CORRECTION: 0020/0021 must run BEFORE pushing the edge functions. The
new chat-import passes p_phone; if the function is deployed first, imports fail
on a signature mismatch. The CLIENT is safe either way (a missing column reads
as empty).

STATE: suites 31, checks 583. Migrations 0001, 0009, 0010–0021.
