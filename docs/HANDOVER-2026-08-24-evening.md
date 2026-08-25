# HANDOVER · 24 Aug 2026, evening

> **SUPERSEDED by `HANDOVER-2026-08-25.md`. Read that first.**
>
> Still accurate for the 24 Aug work, and its testing doctrine and record of
> wrong calls remain worth reading. One correction: it says four functions
> bundle `_shared/enrich_core.ts`. It is six.

**This supersedes `HANDOVER-2026-08-24.md`.** That document is still worth
reading for the 23–24 Aug work, but three of its central claims were disproved
today by executing. They are corrected in "What the old handover gets wrong"
below, and a banner has been added to the top of that file.

Everything marked **measured** was executed and its output read. Everything
else says so.

---

## The framing that changed the whole session

dan, mid-session:

> all the data in the app is for test purposes it has no real value for me so
> there is no point in correcting items for the sake of correction what we need
> is for the app to work properly from now on so we can release it for beta

That single sentence killed a large amount of planned work: no data repair, no
`0042` identity backfill, no adjudicating five duplicate canonicals. The
deliverable is a working app, not a clean database.

**Do not spend time correcting rows.** If a row is wrong, ask what produced it,
fix that, and leave the row.

---

## Production, exactly as it stands

**Commits (all pushed to `origin/main`)**

```
5ec7b47  v0.73.1  a circle named "ski" is about skiing; reading a name is not guessing
9e10304  search: an empty answer beats a wrong one
03148ef  v0.73.0  narrow the writes, anchor the enricher, check every write
be13179  CLAUDE.md project rules            (previous session)
```

**Client** — `v0.73.1 · live`, confirmed on production by dan. Netlify builds
from `origin/main` automatically; there is no build step.

**Edge functions** — deployed and confirmed working. Note that
`.github/workflows/deploy-functions.yml` auto-deploys on any push touching
`supabase/functions/**`, so manual deploys are usually redundant. Deployed this
session: `receive-response`, `send-query`, `wa-signin`, `complete-join`,
`resend-member`, `librarian`, `extract-chat-recs`, `search-library`.

**SIX functions bundle `_shared/enrich_core.ts`** and must be redeployed
whenever it changes:

```
extract-chat-recs   librarian        receive-response
search-library      suggest-sweep    whatsapp-webhook
```

`search-library` joined the list on 24 Aug (it imports `norm`). This handover
first said four; the deploy output named six, and
`grep -rl "_shared/enrich_core.ts" supabase/functions` confirms it. Re-run that
grep rather than trusting this list.

**End-to-end suggestion flow: measured working.** dshapiro8 saves a ski item →
appears in dshapiro1962's inbox. That is the first time this session that the
whole loop was seen working on production.

---

## What was fixed, and why each mattered

### 1 · One save writes the rows the caller named (`v0.73.0`)

`saveRecs`, `saveMembers` and `saveQueries` took no arguments and wrote the
entire array. One unwritable row refused every save the account made — the same
fault fixed in `saveCanonicals` at v0.72.2, and documented on `saveRecs` since
6 Jul without being fixed.

**The live vector is `circle_id`.** It is a foreign key and, unlike
`recommended_by_member_id`, it is written back unvalidated. Delete a circle on
one device and any other device still holding those recs in memory sends a dead
`circle_id` forever after: 23503, one statement, every row refused, permanently,
with nothing in the UI showing which row is at fault.

**Measured 24 Aug: zero such rows on dan's account.** This was structural
hardening, not a repair of something live. Several people on several devices is
what arms it.

Corrections to the old handover's account of this work:

- **Twelve call sites, not ten.**
- **One legitimately writes many rows, not four** (`handleDeleteCircle`).
- **Two calls were dead.** `handleDeleteRec` saved *after* removing the rec;
  `handleDeleteCircle` saved members *after* removing them, and swallowed its
  own failure before deleting them anyway.
- `toggle-share-rec` called `saveRecs()` un-awaited with no catch, so the toast
  said "Shared" over refused writes. Now awaits and rolls back.

### 2 · A refused write must never pass silently (`v0.73.0`)

Nine writes across five edge functions discarded their result. The worst:
**`receive-response` never checked the write that stores the answer and returned
`success: true` regardless.** A person with no account answered a question, saw
the thanks screen, and their reply went nowhere — while the asker was notified
from the *request body* for an answer that did not exist.

It now refuses before enriching or notifying, and `respond.html` offers a real
retry (the token is unspent, because the statement that spends it is the one
that failed).

Also fixed: `send-query` no longer mails a link whose response row failed to
insert; `wa-signin` checks member linking, the OTP attempt counter and OTP
consumption (an unspent code stayed valid until expiry); `complete-join` checks
the claim consumption that stops a forwarded invite being reused.

**Two of those were found by the guard, not by reading**, because it asserts the
general invariant — no awaited write discards its result — rather than matching
the text just written.

### 3 · No anchor, no evidence — and classifying is not inventing

`webGround` searches the web for the **name**, and `aiEnrich` is instructed that
evidence outranks its own recollection. So a bare name resolved confidently to a
stranger and was written with `verified: true`.

Measured: three canonicals named `Tony Vespa`, created with an empty location and
no note, enriched into an Indianapolis technology consultant — kind, location,
tags and category all invented, all `verified: true`. `Art Pizza` became a New
Haven pizzeria the same way.

**The first fix was too broad and broke the suggestion sweep.** Suppressing the
web lookup meant `aiEnrich` received `evidence: ""` and its conservative branch
suppressed the **kind** as well — so `rossignol forza skies` stored `kind: null`,
and the sweep's first gate is `if (!kind) continue`. Two different things had
been conflated:

- asserting a **location or identity** from a bare name — unsafe, still blocked
- saying a thing called "rossignol forza skies" is **skis** — reading the name,
  and never should have been blocked

The prompt now separates them, and `enrichOne` discards an unanchored location
structurally rather than relying on the prompt.

**The sim then caught a hole in that fix.** `resolvePlace` was gated on the hint
being non-empty, which only held while unanchored items also had an empty kind.
The moment `kind: "skis"` was allowed through, Places went back to searching the
world and returned an Indianapolis address. It is now gated on the **anchor**.
One rule: with no location, note or question, nothing external is consulted.

### 4 · An empty answer beats a wrong one (search)

Searching `greta` — a name nowhere in the library — returned "The Israel Museum"
labelled *"closest match in your library"*. Measured:

```
fell_back: true | reranked: false | rerank_error: null
The Israel Museum | score 0.320 | kw 0.500 | vec 0.139
```

The reranker had done its job and returned `{"results":[]}`, obeying the
instruction fifteen lines above it. The fallback overrode it.

Two things were wrong. `kw_sim` is `similarity(search_doc, query)` over the
**whole catalogue document**, so a note reading "great archeology" scored 0.500
against "greta". And the net **could only ever fire when the reranker was
right** — if the rerank fails, `order` is null and `pick` is already the blended
top-N; if there are no candidates the function has already returned.

It now matches the **name** only, by whole-word containment both ways, using the
shared `norm`. Accepted cost, deliberately: a misspelled name returns nothing.

### 5 · A circle named "ski" is about skiing (`v0.73.1`)

dan had two circles named `ski`, one described "resorts, equipment", and
**neither had a single `circle_interests` row**. The sweep matches only
`source = 'confirmed'`, so a member's ski recommendation could never reach him,
and the only thing on screen was a grey link reading "Set what this circle is
about".

Interests are now derived from the circle's own name and description through the
same vocabulary the sweep matches on, written as `confirmed`, on create and as a
backfill on load. An owner who already chose, or declined, is never overridden.
A name matching nothing is left for the picker, whose notice now says what it
costs.

**The product law is untouched.** "Circles are provenance, not evidence" is
about never classifying someone *else's* item by the folder they filed it in.
Reading the name an owner gave their *own* circle is a different act. The
librarian is still never given a circle name, and the sim asserts it.

### 6 · The two filter rows

Labelled `IN CIRCLE:` and `TYPE:`, so a `dining` circle and a `dining` category
are no longer identical-looking chips meaning different things. Also fixed a
latent bug: the circle-filter click swept `.filter-chip:not(.cat-tab)`, which
matched "Needs filing" and "More" too and stripped their highlight.

---

## What the old handover gets wrong

Three claims, all disproved by executing:

**1. "Something rewrote a Tel Aviv pizza answer into an Indianapolis
consultant."** No. Measured: the lowercase `Tony vespa` row (`e7d4e878`, created
6 Jul 06:11:36) is *exactly as created* — `location: ""`, `kind: null`,
`class_source: null`, `ai_tags: []`. Nothing ever wrote content to it. The three
Indianapolis rows are **different rows**, created eight minutes later at
`06:19:02.532896`, all three sharing that timestamp to the microsecond, so one
statement inserted them together. They were born empty and were later filled
with the wrong entity by the enricher. **Nothing was corrupted; rows were born
wrong.**

**2. "…and lost its query link."** The link never existed. `answer_links` is 0
on all seven rows, including one dan created himself through the client.
`query_responses.canonical_id` is set by `receive-response`, and none of these
rows came from that path. They are not answers.

**3. "Blocks all identity work."** It does not, because nothing is changing
underneath. Identity is unblocked — it is simply not needed for beta.

Also corrected: the 14 Aug `updated_at` cluster changed no content column. Same
lesson as the withdrawn 95-row claim — `updated_at` proves touch, not corruption.

**A state today's code cannot produce:** `3ffe2766` and `d9d2936f` carry
`verified: true` with `class_source: null` and `classified_at: null`.
`enrichmentPatch` writes all three together and `verified` is written nowhere
else. That combination came from code that no longer exists, or an ad-hoc run
around `2026-08-09 11:50`. Not diagnosable from here; noted and left.

---

## Identity: current position

Not blocked, not needed for beta. If it is picked up later:

**`primary_category` fails as a Tier 1 discriminator.** Measured across all five
live collision groups: it helps in one and actively hurts in another. `other` is
not a category, it is the fallback (`CATEGORIES.includes(c) ? c : "other"`), so
`home` vs `other` on the `rok` group is one classified row and one unclassified
one, not two meanings. Three of thirteen rows carry "unknown" in a field that
would be deciding identity.

**Normalised name + exact normalised location gets all five right** — two
automatic folds, three questions, zero wrong merges. Empty location must never
match a non-empty one. Containment matching (`גבעתיים` ≈ `גבעתיים, ישראל`) would
catch a fourth but also folds `Paris` into `Paris, Texas`; take the extra
question instead.

**The whole live Tier 1 problem is five groups.** Three unambiguous, two needing
a person. That is a large amount of trigger machinery to automate two minutes of
work. The redirect trigger on `recommendations` is the part that serves future
volume and is sound; Tier 1's automatic fold should stay off.

The five groups: `tony vespa` (5 rows, two real populations), `rok` (2),
`art pizza` (2), `avoriaz 1800` (2), `רומן טמיר` (2).

---

## The guard suite

Every sim has a CONTROL that must FAIL. Run from `simulation_suite/`.

| sim | checks | control | what it runs |
|---|---|---|---|
| `save-scope-recs-sim.js` | 18 | fails 15 | real client in a VM |
| `save-scope-sim.js` | 9 | fails 7 | real client in a VM |
| `enrich-anchor-sim.js` | 16 | fails 12 | **the real body of `enrichOne`** |
| `search-namenet-sim.js` | 11 | fails 6 | **the real fallback block** |
| `circle-interest-seed-sim.js` | 13 | fails | **the real seeding function** |
| `unchecked-writes-sim.js` | 12 | fails 12 | source structure only — see below |

```bash
cd simulation_suite
node save-scope-recs-sim.js  && node save-scope-recs-sim.js --old
node save-scope-sim.js       && node save-scope-sim.js --old
node enrich-anchor-sim.js    && node enrich-anchor-sim.js --old
node search-namenet-sim.js   && node search-namenet-sim.js --old
node circle-interest-seed-sim.js && node circle-interest-seed-sim.js --old
node unchecked-writes-sim.js && node unchecked-writes-sim.js --old
```

Each `--old` run must exit **1**. Each plain run must exit **0**.

**Three of these run real code rather than matching source.** `enrichOne`'s body,
`search-library`'s fallback block and the client's `seedCircleInterestsFromNames`
are extracted from their files at run time and executed against mocks. They are
not copies, so they cannot drift; if someone puts a TypeScript annotation inside
one of those bodies the sim throws rather than passing quietly.

**`unchecked-writes-sim.js` is honestly weaker** and says so in its header: it is
a source-structure check, because these are Deno HTTP handlers and there is no
Deno or TypeScript runtime on dan's machine. It proves "no write discards its
result", not "the handler behaves well".

### Baselines

Each sim names the baseline **its own fix was made against**:

```
index.pre-v0.72.2.html        from git 218c42d — for save-scope-sim
index.pre-v0.73.0.html        for save-scope-recs-sim
index.pre-v0.73.1.html        for circle-interest-seed-sim
enrich_core.pre-v0.73.0.ts    for enrich-anchor-sim
baseline-v0.72.2/*.ts, .html  for unchecked-writes-sim, search-namenet-sim
```

**This matters and was got wrong once.** A single shared "original" snapshot
taken today already contains the sibling fix, and its control **passed** — which
per CLAUDE.md means the suite was measuring nothing. `save-scope-sim.js` also
pointed at `simulation_suite/index.html`, a file that has never existed in this
repo, so the v0.72.2 guard could not be run at all from a clean checkout.

---

## Mistakes made this session

Recorded because the pattern matters more than any one of them.

1. **The `kind` regression was mine.** The anchor guard was written too broadly
   and suppressed classification along with invention, breaking the suggestion
   sweep. Caused by not asking what else read `kind`.
2. **The `placeHint` hole was also mine**, and the sim caught it, not I. Gating
   on a derived value (`placeHint`) rather than the real condition (`anchor`)
   worked only by coincidence.
3. **A control that passed.** Caught only because CLAUDE.md says to check.
4. **Wrong theories, all disproved by measuring:** that trigram similarity would
   be *low* on a long document (it was 0.500 while the vector arm was 0.139);
   that `linked_user_id` was null somewhere (every member row was linked); that
   nothing scheduled the sweep (something does — `sweep_last_at` tracked each
   save to the microsecond).
5. **Twice pasted browser-console JavaScript into a message when dan was working
   in the SQL editor**, and once asked for an item name for a test that had no
   real data behind it. When dan is in the SQL editor, give SQL.

The common thread is unchanged from the last handover: **read the running state
before naming a cause.** Every wrong theory this session died within one query.

---

## Still open

1. **Five unchecked writes outside the audited loop.** Notably
   `whatsapp-webhook:267` (inserts a recommendation) and `update-taste-match:68`
   (an unchecked full-table delete). Same three-line fix as the nine already
   done.
2. **`migrations/0044_identity_security_definer.sql` does not exist** — not in
   the working tree, not in any git history. The old handover says its statements
   are applied to production. If true, live database functions have no source in
   version control.
3. **Nothing in the repo schedules `suggest-sweep`.** No cron in the migrations,
   no `config.toml`, no `schedule:` trigger in either workflow. Something is
   running it (measured), but it lives in the Supabase dashboard, outside version
   control, where it can vanish silently.
4. **Sim baselines weigh ~1.5 MB** in `simulation_suite/`. Necessary for the
   controls; worth knowing.
5. **`e2e/` and `eval/` were never run or read** this session.
6. **`saveCircles` still writes the whole array.** Left deliberately: `circles`
   has no foreign key except `owner_id`, so it has no poison vector. Same shape,
   no known risk.

---

## Next, in the order I would do it

1. **Walk the whole loop on a clean browser** — ask, answer from a phone, save,
   search, suggest. Most of this session's work has now been seen working, but
   never all in one pass.
2. **The five remaining unchecked writes.** Small, bounded, same fix.
3. **Put the sweep schedule in the repo** as a pg_cron migration, so it cannot
   silently disappear.
4. **Decide on `0044`** — find what is actually applied in production and commit
   it, or drop the claim.

Identity stays parked. It is not blocked any more; it is simply not what beta
needs.
