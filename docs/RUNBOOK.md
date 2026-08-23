# Identity on write — runbook

Two migrations. **Nothing has been run against production.**

## Before anything

`0042` is the only destructive one, and only statements 4, 5, 6 and 7 write.
Take a backup first. Every fold it makes is recorded in
`canonical_resolution_log` and can be undone with `unmerge(event_id)`.

## Order

1. **0041** — 18 statements. Schema, functions, triggers. Changes nothing that
   already exists; only what happens on the next write.
2. Confirm the app still saves. Add one item from the client and one from the
   WhatsApp bot. Both should appear.
3. **0042** — 10 statements. Statements 1, 2, 3, 8 and 10 are read-only.
   **Read the output of 1 and 2 before running 4.**

## Running them

The Supabase SQL editor sends **each statement on its own connection**. There
is no shared transaction. Paste and run **one statement at a time**. Every
statement is idempotent, so a stop halfway leaves a complete state and a re-run
changes nothing — both verified with `sql-editor-runner.sh`.

Do not add `begin`/`commit`. They imply an atomicity you do not have.

## Expected on the 22 Aug library

Reconstructed from the pairs your query returned:

```
before   30 canonicals (fixture), none folded
after    live 17   folded 13   questions 4   recs_on_tombstone 0

folds silently   Tony Vespa ×4 -> 1        art pizza -> Art Pizza
                 k2 -> K2                  ROK ×2
                 Avoriaz 1800 ×2           אבו חסן ×2
                 רומן טמיר ×2              בית ספר אלחריזי ×2
                 yes in shevach ×2         שושן שמוליק -> שושן-שמוליק
                 Eli מיזוג אוויר -> Eli מזוג אויר   (on phone, not name)

asks             artzieli           ? Artzieli Pizza     0.600
                 Artzieli Pizza     ? Art Pizza          0.563   <- you said DIFFERENT
                 tamati             ? Caffe Tamati       0.538
                 ד"ר לירן חורב-יקיר ? דר לירן חורב       0.524
```

`recs_on_tombstone` must be 0 after statement 7. If it is not, statement 7 did
not run.

## Answering the four questions

```sql
select q.id, a.name as candidate, b.name as head, q.score
  from public.canonical_fold_queue q
  join public.canonicals a on a.id = q.candidate_id
  join public.canonicals b on b.id = q.head_id
 where q.status = 'pending' order by q.score desc;

select public.resolve_fold('<queue id>', true);    -- yes, same thing
select public.resolve_fold('<queue id>', false);   -- no, keep them apart
```

`resolve_fold(..., true)` returns an `event_id`. Undo it with
`select public.unmerge('<event id>');` — every recommendation goes back to the
canonical it came from.

## If something looks wrong afterwards

```sql
-- everything that was folded, and how it was decided
select at, tier, canonical_id, head_id, rec_id, prev_canonical_id, new_canonical_id, detail
  from public.canonical_resolution_log order by at desc limit 100;
```

Nothing is deleted by either migration. A folded canonical is still a row with
`merged_into` set; clearing that column brings it back.

## Rolling back entirely

```sql
drop trigger if exists canonicals_identity_fold_trg on public.canonicals;
drop trigger if exists canonicals_identity_enqueue_trg on public.canonicals;
drop trigger if exists recs_point_at_head_trg on public.recommendations;
update public.canonicals set merged_into = null where merged_into is not null;
```

The recommendations stay where the backfill put them. Put them back from the
log if you need to.

## Re-running the test suite

```bash
cd simulation_suite
./run-implementation.sh
```

Needs Postgres on port 5433 — see `REPRODUCE.md` in the candidates package.
