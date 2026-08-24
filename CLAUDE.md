# Trustnet

A private trusted recommendation network. Members ask their circles for
recommendations, keep what they answer, and see what people they trust have
saved.

Live at trustnetsocial.netlify.app. Postgres on Supabase, project
`kgsdtfrcyjrxeyqqxoic`. The whole client is one file: `web/index.html`.

---

## Start here

Read `docs/HANDOVER-2026-08-24.md` before touching anything. It records what is
live, what is applied but deliberately inert, and what is known to be broken.

**Three identity triggers are dropped on purpose.** Do not arm them. The reason
is in the handover.

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

---

## Known broken, in priority order

1. **`saveRecs` writes the whole array.** Same fault fixed in `saveCanonicals`
   at v0.72.2. Its own comment at line ~1378 has documented it since 6 Jul.
   Ten call sites; four legitimately touch multiple recs. `saveMembers` and
   `saveQueries` too.
2. **Something rewrote a Tel Aviv pizza answer into an Indianapolis
   consultant** and lost its query link. Not recoverable from the data — no
   history table. Blocks all identity work.
3. **Identity needs a redesign** before the triggers are armed. Tier 1 folds on
   normalised name alone and would merge two different things that share a name.
4. **The two filter rows are indistinguishable.** Circles are named `ski`,
   `dining`, `test`, `health` — the same words as the categories — and `health`
   and `test` both have domain `dining`. Label them, and no dropdown under All.
