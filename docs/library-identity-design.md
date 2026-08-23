# Identity on write — design

**22 Aug 2026. Nothing built.** Resolves the hole in item 1 of
`library-design-final.md`. Supersedes item 1 and item 8 of that document;
items 2–7, 9 and 10 stand unchanged.

Every claim below marked *executed* was run against Postgres 16 in the
container, against the real schema and the real function bodies. Every claim
marked *production* came from a statement dan ran in the Supabase editor on
22 Aug. Where something was only read or only reasoned about, it says so.

---

## The hole, restated

`library-design-final.md` proposes a `before insert` trigger on
`recommendations` calling `match_canonical(name, location, phone)`.

A recommendation row carries `canonical_id`. It does not carry name, location
or phone — those live on the canonical, which does not exist yet at that point.
`member_identity` works because a member row carries its own `contact_method`
and `contact_value`. A recommendation's identity lives one table over.

---

## Five candidates, executed

Each was applied to a fresh database, then six writers were replayed — the four
real save paths, plus a future writer that knows nothing about the design, plus
the `handleConfirmSaveToLibrary` shape that writes the rec before the canonical.

| | live canonicals | cards | the writer nobody told | rec-before-canonical |
|---|---|---|---|---|
| baseline | 4 | 4 | duplicate | FK error |
| **A** RPC `save_recommendation()` | 2 | 2 | duplicate | FK error |
| **B1** before-insert, `return null` | 1 | 2 | — writer dies | FK error |
| **B2** after-insert, delete the dupe | 1 | 2 | — writer dies | FK error |
| **C** transient columns on `recommendations` | 2 | 4 | duplicate | FK error |
| **D** fold on write + redirect on reference | 1 | 5 | **folded correctly** | FK error |

**B is dead both ways.** Any mechanism that removes the row breaks the
two-statement write every non-RPC writer performs. `return null` means
`insert … returning id` yields no row and the writer holds null; deleting
afterwards means the returned id points at a deleted row. Three of six writers
died in each case.

**A and C can be forgotten.** Both work, and both require every writer to adopt
a new call shape. That has failed twice with members and once already in the
library.

**D is the mechanism.** The duplicate row is still written and marked
`merged_into`, so `returning id` stays valid and the FK the writer is about to
use holds. A second trigger points every incoming rec at the head. The future
writer folded correctly without knowing anything existed.

### Corrections to `library-design-final.md`

**The FK error reproduces.** The previous session could not reproduce it and
did not claim it as the cause. Writer `w6` — insert the rec, then the canonical,
the shape at `index.html:7263`/`7289` — raises
`recommendations_canonical_id_fkey` every time. That is not proof it is dan's
cause; it proves the shape is sufficient.

**Canonical dedup does not collapse the cards.** The sweep loops over
*contributions*, not canonicals. One canonical carrying four recommendations
still emitted four DELIVERED. The claim that four canonicals become four cards
is wrong at the decision loop. **Unverified:** `sweep-sim.js` ports the decision
loop only. `suggest-sweep`'s insert side was not available and may dedupe.

**The fixture overstated by one.** Replaying the real writer logic gives three
canonicals, not four — `extract-chat-recs` calls `match_canonical` and folds
into `receive-response`'s.

**No mechanism removes the FK-ordering fault.** `library-design-final.md` says
item 1 removes it as a category. It does not. A and C remove it only for writers
that adopt the new call shape, which is exactly the property that gets
forgotten. It is a client ordering bug and needs a client fix.

---

## Why D alone is not enough

**Executed.** The same five writers, run with the unenriched one first:

```
order w1..w5 (enriched first)   1 live canonical, head kind "restaurant"   5 of 5 delivered
order w3,w4,w5,w2,w1            1 live canonical, head kind (null)         0 of 5 delivered
```

Folding does not fix routing. Delivery is an artefact of which save happened to
land first. Items 2, 3 and 4 of `library-design-final.md` are what fix routing,
and this design does not substitute for them.

**And the fold rule over-merges.** `match_canonical`'s trigram threshold of
0.45, applied silently to every write:

```
Trattoria Mario / Trattoria Marco     0.684   folds — two different restaurants
Hotel Bella Vista / Bella Vita        0.750   folds — two different hotels
Cafe Rimon / Cafe Limon               0.571   folds
Dr Cohen / Dr Cohn                    0.545   folds
```

The production measurement of twelve `match_canonical` pairs measured the 118
canonicals that already exist. It did not measure what the rule does to names
arriving at write time.

---

## The evidence from production

**Production, 22 Aug.** All 118 canonicals are `type = 'place'`; phone on 5.
Zero canonicals are `type = 'person'`. Any rule with a `type = 'person'` branch
would never fire, so no such branch is proposed.

Two phone collisions, both true duplicates:

```
505303690   שושן שמוליק      | שושן-שמוליק
545666006   Eli מיזוג אוויר  | Eli מזוג אויר      כתיב מלא vs כתיב חסר
```

Twenty-one name pairs above 0.45, and they fall into two populations:

```
15 pairs, 10 clusters    score 1.000        Tony Vespa ×4, art pizza / Art Pizza,
                                            K2 / k2, שושן שמוליק / שושן-שמוליק,
                                            בית ספר אלחריזי ×2, אבו חסן ×2,
                                            רומן טמיר ×2, Avoriaz 1800 ×2,
                                            ROK ×2, yes in shevach street ×2

 6 pairs                 0.45 – 0.99
   0.600  Artzieli Pizza      / artzieli               same
   0.579  Eli מיזוג אוויר     / Eli מזוג אויר          same
   0.563  Artzieli Pizza      / Art Pizza              DIFFERENT — confirmed by dan
   0.538  Caffe Tamati        / tamati                 same
   0.524  ד"ר לירן חורב-יקיר  / דר לירן חורב           same
```

**The score does not rank truth.** The false pair sits at 0.563, between two
true pairs at 0.579 and 0.538. In Florence the same interleaving appeared:
0.905 same, 0.750 different, 0.684 different, 0.615 same, 0.545 same. There is
no cut point, in Hebrew or in English. This is the finding the design is built
on.

**`Tony Vespa` exists four times with no phone.** That is the fan-out, live,
today, on one real restaurant.

---

## The rule — three tiers

**Tier 1 · normalised-exact → fold silently.**
`norm_name(a) = norm_name(b)`, where `norm_name` lowercases, replaces every run
of non-alphanumerics with a single space, and trims. This is not a guess; it is
the same string written two ways. **Executed:** separates all six 1.000 pairs
from all five sub-1.000 pairs, Hebrew included. Ten clusters, 22 rows become 10.

**Tier 2 · phone match → fold silently.** `phone_key` equal, nine digits or
more. **Production:** 2 for 2 correct. No `type` exception, because `type`
cannot express one.

**Tier 3 · anything else above 0.45 → ask.** The row stays live. A pending
question is recorded. Nothing merges until a person answers. Six questions on
backfill; five yes, one no.

The silent tier must be defined as `norm_name(a) = norm_name(b)`, **not** as
`similarity = 1.0`. The two agreed on all eleven pairs tested, but trigram sets
can coincide for strings that are not equal. Exact string equality after
normalisation is decidable and guardable offline; a float is neither.

### Tier 1 and tier 3 must ship together

**Executed.** `Art Pizza` is safe today only because the row `art pizza` exists
and an exact match outranks a guess:

```
library as it is now                        a save of "Art Pizza" -> Art Pizza
if "Art Pizza" had never been saved before  a save of "Art Pizza" -> Artzieli Pizza
```

Tier 1 merges `art pizza` into `Art Pizza` — correctly — and in doing so removes
the row that was protecting it. Ship tier 1 without tier 3 and every subsequent
save of Art Pizza through `receive-response` or `extract-chat-recs` lands on
Artzieli Pizza. **Tier 1 alone makes the library worse than it is now.**

The corollary is the reassuring one, and it was executed: after a pair is
answered *keep apart*, saving `Art Pizza` again matches the kept-apart row
itself at 1.000, not Artzieli at 0.563. The question is not asked twice. The
design keeps that protective row alive deliberately, where today it survives by
accident because the WhatsApp path never matched anything.

---

## Mechanism

**Not migrations.** Shapes for review. Nothing here has been through
`simulation_suite/sql-editor-runner.sh`.

```sql
-- normalisation: the silent tier's whole definition
create or replace function norm_name(p text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(lower(btrim(p)), '[^[:alnum:]]+', ' ', 'g')), '');
$$;

alter table canonicals add column merged_into uuid references canonicals(id) on delete set null;
create index canonicals_merged_into_idx on canonicals (merged_into) where merged_into is not null;
create index canonicals_norm_name_idx   on canonicals (norm_name(name)) where merged_into is null;
```

`canonical_head(id)` follows `merged_into` to the live row, capped at eight hops
so a cycle cannot hang a write.

`canonicals` **before insert** — the three tiers, in order. Tier 1 and tier 2
set `merged_into`; tier 3 records a pending question and leaves the row live.
The row is always written, so `returning id` is valid and the FK the writer is
about to use holds.

`canonicals` **after insert** — writes the queue row. A pending question is
`(candidate_id, head_id, score)`, unique on the pair.

`recommendations` **before insert or update of canonical_id** —
`new.canonical_id := canonical_head(new.canonical_id)`. This is the answer to
the hole: the trigger on `recommendations` is a **redirect**, not a matcher. It
needs no name, no location and no phone. It follows a pointer.

`match_canonical` gains `merged_into is null` on both branches, so it can never
hand back a tombstone. Nothing else about it changes.

### Every match above threshold is queued, not the best one

**Executed.** Candidate E kept only the top match per insert. `Artzieli Pizza`
matches both `artzieli` at 0.600 and `Art Pizza` at 0.563, and only the higher
was ever asked about. Convenient here — it suppressed the false pair — but a
genuine duplicate inside a cluster of three can go unasked forever. The queue
records every match above 0.45.

### Reversibility

`resolve_fold` repoints recommendations from the folded row to the head. As
written that is the one irreversible operation in the system, and it is the one
operated by a person tapping through a list.

So: a `canonical_resolution_log` row per resolution — the rec, its previous
`canonical_id`, the new one, the tier that decided, when. Written for silent
folds too, not only for answered questions. Two things follow. A mis-tapped
*yes* can be undone by an `unmerge` that reads the log back. And a bad silent
fold becomes visible, where today a save landing on the wrong canonical leaves
no trace that a match happened at all — which is why it is not currently
knowable how many existing recommendations are attached to the wrong thing on
the two paths that already call `match_canonical`.

---

## The merge of what already exists

Ten clusters, 22 rows to 10, all tier 1. Delivered as numbered statements, one
per cluster, each idempotent and independently verifiable, each recorded in the
resolution log so it can be undone.

The six tier-3 pairs are **not** merged by the backfill. They enter the queue
and wait for an answer. Six is small enough to backfill; if the same query
returns sixty after some future import, the queue should ask only on write and
never backfill, which is a different shape and should be re-decided then.

---

## Guards

Every guard asserts a **row outcome**, never the presence of a trigger and never
the spelling of a message. The mistakes list records guards that matched text
which survived the thing they were meant to catch, and one that passed when its
condition was neutered to `if (false)`. Each guard below is written so that
disabling the mechanism it covers makes it fail.

**Positive**

1. `norm_name('Tony vespa') = norm_name('Tony Vespa')`, and the same for
   `שושן שמוליק` / `שושן-שמוליק`, `K2` / `k2`, `art pizza` / `Art Pizza`.
2. Two rows differing only in case: second row has `merged_into` = first, and a
   rec inserted against the second **lands on the first**.
3. Same `phone_key`, different names: folded.
4. A blind writer — `insert canonical returning id`, then `insert rec` — leaves
   the rec on the head. This is the forgetting test; it must fail if either
   trigger is dropped.
5. The id returned by `insert … returning id` is usable as an FK immediately.
6. Chain A→B→C: `canonical_head(A) = C`. A cycle terminates.
7. `unmerge` after a merge restores every rec to its original `canonical_id`,
   read from the log.

**Negative — each of these must NOT happen**

8. `norm_name('Art Pizza') <> norm_name('Artzieli Pizza')`.
9. Insert `Artzieli Pizza` then `Art Pizza`: **both live**, `merged_into` null on
   both, exactly one pending question. Nothing merged.
10. `Trattoria Mario` and `Trattoria Marco` both live after insert.
11. A phone of fewer than nine digits folds nothing.
12. After *keep apart*, a further save of the same name matches the kept-apart
    row, not the rejected head, and adds no new pending question.
13. A pending question never resolves itself: after any number of further
    inserts, status is still `pending` and both rows are still live.

---

## What this does not do

- **It does not fix routing.** Delivery remains order-dependent on which save
  landed first. Items 2, 3 and 4 fix that.
- **It does not stop search presenting two places as one.**
  `search_library_hybrid` scores trigram similarity, so `art pizza` will return
  Artzieli adjacent and ranked however the identity question was answered. Item
  5, a different surface.
- **It does not fix the FK-ordering fault.** `w6` fails under every candidate.
  Client-side ordering fix.
- **It does not reduce four saves to one suggestion card.** The sweep emits per
  contribution.
- **It is not concurrency-safe.** *Executed:* two simultaneous blind saves of
  the same new place produce two heads under both A and D. A
  `pg_advisory_xact_lock(hashtext(norm_name(new.name)))` in the before-insert
  trigger would serialise same-name writes. **Untested** — it should be built
  and measured before it is believed.

---

## Order

Unchanged from `START-HERE-next-session.md`. This is step 2.

1. Version `suggestions`.
2. **Identity** — this document, then the guards in `send_rec_to_member`.
3. Matching — enrichment on the canonical, interests on the item, gate 2 soft.
4. Retrieval — the note in scoring, one error-checked load, the split.

---

## Still not known

- **How many existing recommendations are already on the wrong canonical.** Not
  knowable without the resolution log, which is why the log is in the design.
- **Whether `suggest-sweep` dedupes on insert.** Its source was not available.
  If it does not, four saves stay four cards after this ships.
- **The ongoing rate of tier-3 questions.** Backfill is six. The forward rate
  depends on save volume, which is unmeasured.
- **Whether the advisory lock holds** under two simultaneous writes.
- **Why `type` is uniformly `place`.** Not investigated. Until it is, no rule
  should read it.
