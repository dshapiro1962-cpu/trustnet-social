# Trustnet

A private trusted recommendation network. Members ask their circles for
recommendations, keep what they answer, and see what people they trust have
saved.

Live at trustnetsocial.netlify.app. Postgres on Supabase, project
`kgsdtfrcyjrxeyqqxoic`. The whole client is one file: `web/index.html`.

---

## Start here

Read `docs/HANDOVER-2026-09-21.md` first — v0.96.0, the sheet moved out of "my
questions" and into the Library — then `docs/HANDOVER-2026-09-19.md`, the
v0.95.0 redesign and what it did not finish, then
`docs/HANDOVER-2026-09-14.md`, which records everything
up to v0.94.1: what is live, what was fixed, and what is still open. `HANDOVER-2026-09-09.md` carries a
banner naming its three corrections. The three earlier handovers
(`HANDOVER-2026-08-25.md`, `HANDOVER-2026-08-24-evening.md`,
`HANDOVER-2026-08-24.md`) are superseded and each carries a banner saying what
in it is wrong — read them for the testing doctrine and the record of wrong
calls, not for the current state.

**You CAN deploy edge functions. You cannot deploy Netlify.** Corrected 13 Sep
2026 — this file said both were blocked, which cost a session the ability to
finish its own work.

- `supabase functions deploy <fn> --project-ref kgsdtfrcyjrxeyqqxoic` **works**.
  Add `--no-verify-jwt` for anything respond.html calls. Verify it afterwards
  with `supabase functions download` and diff against git; the success message
  is not evidence.
- `netlify deploy` is refused by the permission classifier. `netlify sites:list`
  is allowed. Push instead and let Netlify build from `origin/main` — it lands
  in about 25 seconds.
- `gh` is still not installed, so workflow runs cannot be checked.

Never end a piece of work with a deploy block as though the change were live.
And when a client change
writes a NEW COLUMN, the migration must be applied BEFORE the push: Netlify
deploys within a minute, and the window between would fail every save.

**All data in the app is test data.** dan, 24 Aug: it "has no real value... what
we need is for the app to work properly from now on so we can release it for
beta". Do not spend time correcting rows. If a row is wrong, fix what produced
it and leave the row.

**Three identity triggers are dropped on purpose.** They are on `canonicals`.
Do not arm them. `trg_member_identity` on `members` is a different thing, it IS
armed, and it must stay armed: it gives every member row its `person_id`, which
is what `members_person_circle_uniq` and migration 0051 both stand on. Reading
this line as covering members cost a session an hour on 21 Sep. Identity is
no longer *blocked* — nothing is rewriting canonicals underneath it — but Tier 1
still folds on normalised name alone, and the whole live problem is five
collision groups. Not what beta needs.

---

## How dan works, and why

**Analysis before build. Attack your own analysis. Wait for the go.**
Propose, argue against your own proposal, then stop. Do not start writing until
dan says go.

**Test the deliverable. Negative-test every guard.**
A guard that passes when its mechanism is removed is not a guard. Every suite
here opens with a CONTROL section that must FAIL on the unfixed code — if the
control passes, the suite is measuring nothing. `simulation_suite/neuter-tests.sh`
is the pattern: disable each mechanism in turn, require a failure.

**No patching when the structure is wrong.**
If the fix needs an exception that would never fire, or a column that carries a
meaning the product does not have, stop and say so.

**Every command in full. Literal paths. Complete sequences.**
dan runs Windows PowerShell. Never assume a working directory. SQL goes in the
Supabase SQL editor, never in PowerShell.

**Read the running state before naming a cause.**
Five times in the 23–24 Aug session a cause was asserted and then disproved by
executing. The pattern was reasoning from the schema instead of asking what the
system was doing. The clearest case: four elaborate explanations for a missing
library item, when two console lines showed nothing was broken at all.

---

## Client rules · web/index.html

Hard constraints, learned from breakages:

- No template literals in render functions
- No inline `onclick` handlers — event delegation with `data-action` attributes
- No external CSS or font imports
- Hardcoded fallback colours for all critical layout CSS
- `node --check` on the extracted script before every commit
- Bump `APP_VERSION` on every client change; it renders on Home and is how dan
  confirms a deploy landed

Extract and check the script:

```powershell
cd C:\dev\trustnet-repo
python -c "import re;s=open('web/index.html',encoding='utf-8').read();b=max(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>',s),key=len);open('app_extracted.js','w',encoding='utf-8').write(b)"
node --check app_extracted.js
Remove-Item app_extracted.js
```

---

## Before shipping to anyone

`docs/BETA-SMOKE-TEST.md` walks the whole product in one sequence, in the order
a real person meets it — the answer loop, the enricher, search, suggestions,
categories, and the two-device save-path stress test. Each step says what it
proves and what failure looks like. About 25 minutes, two accounts.

Run it after any change that touches saving, enrichment or the sweep. The parts
it cannot cover are named at the bottom of the file rather than left implied.

---

## Migrations

The Supabase SQL editor sends **each statement on its own connection**. There is
no shared transaction.

- Number every statement. Run them one at a time.
- Every statement idempotent, so a stop halfway leaves a complete state.
- No `begin`/`commit` — they imply atomicity you do not have.
- `create or replace trigger`, never `drop` then `create`: stopping between them
  leaves the trigger disarmed.
- Verify with `simulation_suite/sql-editor-runner.sh` before handing it over.

---

## Testing

**A simulator that cannot fail the way production fails is not evidence.**

`simulation_suite/identity_guards.sql` has 27 guards and ran as `postgres` with
RLS off. It could not catch the fault that broke saving the moment triggers were
armed. `rls-sim.js` (dropped after v0.65.0) mocked `upsert` as `{error:null}`
and would have passed while one save rewrote 95 rows.

Use these instead:

- `simulation_suite/full_setup.sql` — Supabase's role layout, default privileges
  on future tables, RLS enabled. The only faithful environment.
- `simulation_suite/rls_identity_guards.sh` — RLS on, non-superuser, triggers armed
- `simulation_suite/save-scope-sim.js` — asserts the payload ROW COUNT
- `simulation_suite/neuter-tests.sh` — nine sabotages, each must break a guard

Added 24 Aug. Every one has a CONTROL that must FAIL (`--old`, exit 1):

- `save-scope-recs-sim.js` — asserts EQUALITY WITH THE CALLER'S LIST, not a row
  count: `handleDeleteCircle` legitimately writes many rows, and a count-based
  assertion would both forbid that and pass while writing the wrong rows
- `enrich-anchor-sim.js` — runs **the real body of `enrichOne`**
- `search-namenet-sim.js` — runs **the real fallback block** of `search-library`
- `circle-interest-seed-sim.js` — runs **the real seeding function**
- `suggestion-filing-sim.js` — runs **the real modal and filing function**
- `personal-category-sim.js` — runs **the real category helpers**
- `unchecked-writes-sim.js` — source structure only, and says so in its header;
  there is no Deno or TypeScript runtime on dan's machine

Added 25–26 Aug, same rule:

- `inbox-state-sim.js` — runs **the real save path**, asserting the RPC result
- `item-facts-sim.js` — runs **the real `canonFacts` / `itemFactsText`**
- `field-contract-sim.js` — the contract, checked against every reader
- `circle-place-sim.js` — runs **the real `placeFits` lifted from the sweep**
- `beta-strip-sim.js` — executes the wiring; position asserted structurally

Added 21 Sep, same rule:

- `library-sheet-sim.js` — runs **the real item normaliser** of
  `receive-response` and **the real audience filter** of `send-collection` in a
  vm, and RENDERS AND USES the three sheet screens in Chrome at 390px
- `join-adopts-sim.js` — the REAL join functions against the REAL database,
  rolled back; proves the constraint and the trigger are there before it claims
  anything, and its control restores the pre-0051 path from the 0025 migration
- `invite-words-sim.js` — lifts the REAL invite-message builders out of the page
  and executes them, then reads the message a person actually receives

Added 25–26 Sep, same rule:

- `server-phone-sim.js` — lifts **the real `toE164`** out of
  `_shared/utils.ts` into a vm (there is no Deno here, so the one type
  annotation is stripped and the REAL BODY runs) and proves the server stops
  inferring a country too. Baseline `fn-pre-2026-09-26/`; its control fails 12
  of 23 and PRINTS THE BUG — the old rule turns a British `07911 123456` into
  `9727911123456`. Its structural checks read the source with comment lines
  removed: the first run reported FAIL on correct code because the new comment
  QUOTES the two deleted lines, which is the 25 Aug trap exactly
- `one-normaliser-sim.js` — lifts **the real phone layer** into a vm twice, once
  with libphonenumber and once without, and checks that the country is ASKED
  for rather than guessed. Baseline `index.pre-v0.99.2.html`; its control fails
  36 of 37, and the one that survives is the line proving the library is absent

**44 of the 96 sims in this directory run on this machine, and all 44 are
green** (measured 26 Sep by running every one of them: `for f in *-sim.js; do
node $f; done`). The other 52 open `/home/claude/...` — a container path that
does not exist here — so they exit 1 on ENOENT without asserting anything.
**Count them before quoting a number.** This line said "26" for four days after
the true figure had passed thirty.

Eight were added
10–19 Sep, and three of them run against the REAL database as role
`authenticated` with RLS in force, in a transaction that is always rolled back:
`inbox-save-live-sim.js`, `sheet-recall-live-sim.js`, `people-search-live-sim.js`.
Each proves the environment before asserting anything — a foreign-owner insert
must be REFUSED, or RLS is not on and nothing below it is evidence.

**IF A CHANGE ADDS MARKUP TO A RENDER FUNCTION, THE TEST MUST RENDER IT.**
On 16 Sep the Add to Library dialog was completely broken in production
(`ReferenceError: editId is not defined` in `modalAddRec`) while the suite was
green: `save-and-send-sim.js` asserted 24 correct things about the three helper
functions and never called the builder that uses them. A vm over a hand-built
DOM cannot catch a render that throws. `modal-render-browser-sim.js` now loads
the real page in headless Chrome and calls every modal builder there is; a builder that
throws is a screen that does not open. It needs Chrome and skips cleanly (exit
2) without it. Since 21 Sep it also checks its own hand-kept list against every
name `openModal` dispatches — the list had already missed `sheet-send`.

`redesign-browser-sim.js` (v0.95.0) goes further: 27 screens drawn at phone
width, then USED — the first-run steps, Paste a number, Degree 2, the verb
switch, the Save sheet's send. **Headless Chrome on Windows will not open a
window narrower than ~512px**; `--window-size=390` silently lays out at 512
and crops, so any phone check must render inside a 390px iframe, as this one
does. And a probe injected into the page must never search `document.body` —
its own source is in there.

The other files in that directory do not run on this machine — 17 open a
container path that does not exist here. It is 24 live sims inside an archive.

**`core.autocrlf` is true on this machine.** A file a patch writes with LF comes
back from the next checkout with CRLF, and any sim that slices source with
`indexOf('
}
')` then silently finds nothing. `delivery-errors-sim.js` went
from 36 green to a crash that way, with no line of the product changing. Read
source through a `.replace(/
/g, '
')` and the trap does not exist.

**A guard that passes for the wrong reason is worse than no guard.** Four did
on 25 Aug, in a session about guards: one searched for an identifier that
already existed in the baseline for an unrelated reason; one anchored on a
phrase that first occurs in the comment written directly above the fix; one set
up its own state too late and blamed the code; one asserted on a mocked value
that is identical before and after. Check what a new assertion does against
`--old` before believing it.

**Each sim names the baseline its OWN fix was made against.** A single shared
"original" snapshot already contains the sibling fix, and its control passes —
which by the rule above means the suite is measuring nothing. That happened once
on 24 Aug and was caught only because this file says to check.

Postgres is not installed in a fresh container and `/tmp` is wiped between
sessions. See `simulation_suite/REPRODUCE.md`.

**Assert row outcomes, never the absence of an error.** With only a `select`
policy a `DELETE` does not error — it silently removes nothing, and a guard
reading "no error" passes for the wrong reason.

---

## Data model, the parts that matter

`canonicals` is **shared** — one row per thing, used by every member's library.
`recommendations` is **per member** — `owner_id`, note, rating, tags, circle.
A member owns their own library entry and may edit it; **the name is not
editable**, so the canonical's name is stable shared identity.

`query_responses.canonical_id` splits the two populations cleanly: **65 answers,
56 entities** of 121 live rows. An answer is a reply to a query, hanging off the
entity it is about. Both are canonicals. Any rule that matches names across the
whole table must exclude answers, or it will compare one opinion to another.

Columns that look useful and are not: `type` is uniformly `place` on every row.
`kind` is free text, bilingual, 43 distinct values, absent on 63 of 122.

**TWO CATEGORY COLUMNS, AND THEY ANSWER DIFFERENT QUESTIONS** (0045). Getting
this backwards is the most likely mistake in this schema:

- `recommendations.category` — **yours**. Free text, per member, a USE-CASE:
  "shabbat dinner", "quick lunch". Everything the OWNER sees goes through
  `recCategory(rec, can)` in the client: their word if they set one, the
  canonical's shared type if not.
- `canonicals.primary_category` — **shared**. One of eight, a TYPE. Invisible
  to the owner. Exists only so suggestions and taste-match have something
  comparable across accounts.

Display and filtering for the owner → `recommendations.category`. Anything that
crosses accounts → `canonicals.primary_category`. Never the other way round.
`other` is not a category, it is the fallback — which is why it failed as an
identity discriminator on 24 Aug.

---

## Known broken, in priority order

Everything on the 23 Aug list is resolved. Items 1 and 4 were fixed on 24 Aug
(v0.73.0 / v0.73.1); item 2 turned out never to have happened; item 3 survives
restated below. All fifteen unchecked writes across nine edge functions were
fixed on 24 Aug, guarded by `unchecked-writes-sim.js`. What remains:

1. **A circle can be `declined` and `confirmed` at once.** `handleSetInterests`
   deletes before inserting, but the custom-interest path at
   `web/index.html:6693` inserts without clearing. Harmless while the sweep
   reads only `confirmed`.
2. **`migrations/0044_identity_security_definer.sql` does not exist** in the
   working tree or in any git history, yet the previous handover says its
   statements are applied to production. Live functions may have no source in
   version control.
3. **The sweep schedule is not in the repo.** Identified 9 Sep: a **pg_cron**
   job, `suggest-sweep`, `*/5 * * * *`, active, 8,328 dispatches — not a
   dashboard setting. Transcribing it into a migration must read the
   service_role key from Vault; the live `cron.job.command` embeds it in
   plaintext. Also raise `timeout_milliseconds` while doing it: **30.6% of
   dispatches time out at `pg_net`'s 5s limit** on an idle database (measured,
   9 Sep).
4. **Identity Tier 1 needs a discriminator** before the triggers are armed.
   `primary_category` does not work — `other` is the fallback, not a category.
   Normalised name **plus exact location** gets all five live collision groups
   right. Not needed for beta.
5. **`saveCircles` still writes the whole array.** Left deliberately: `circles`
   has no foreign key except `owner_id`, so no poison vector. Same shape, no
   known risk.
6. **"That's your own number" never fires.** `web/index.html:9598` guards
   against adding yourself as a member by comparing the typed number against
   `AppState._authPhone` and `AppState.userProfile.phone`. Neither is ever
   written. `_authPhone` is read in that one line and assigned nowhere in the
   file. And `users.phone` **does exist in the schema** (0001) — `loadUserData`
   selects `*` but the profile object it builds omits the column, so
   `userProfile.phone` is always undefined. The guard has always been dead.
   Corrected 26 Sep: an earlier version of this line said the column was not
   selected, which understates how cheap the fix is — it is one more field in
   the map at `web/index.html:1828`. Doing it would also give
   `PHONE_DEFAULT_COUNTRY` a real signal to use instead of assuming Israel.
