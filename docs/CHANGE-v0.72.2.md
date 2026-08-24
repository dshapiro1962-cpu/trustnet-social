# v0.72.2 — one save writes one row

**Client change. `web/index.html` only. No migration.**

## What was wrong

`saveCanonicals` upserted the **entire** library on every save. Measured on
production 23 Aug: **95 rows rewritten by one save of one item.**

An upsert is a single SQL statement, so one unwritable row anywhere in the
array refused the whole statement and every save in it was lost together.
dan's library carried four rows with `created_by NULL` — three `Tony Vespa`
and one `Art Pizza` — none of which the library view displays, so the poison
was invisible from the app and could not be removed from it. Saving was broken
from at least 6 Jul until 0043 on 23 Aug.

0043 drained today's poison. It did not stop the next unsigned row doing the
same thing. This does.

The identical fault is documented on `saveRecs` at line ~1378: *"because
saveRecs upserts the WHOLE array, ONE such row blocked EVERY save that account
made, permanently."* Found 6 Jul, fixed there by correcting the columns rather
than by narrowing the write. **`saveRecs` still writes the whole array and
still has this fault.** Not changed here — one thing at a time.

## The change

`saveCanonicals(ids)` takes the ids it should write. Four call sites, each of
which touches exactly one canonical:

    3240  handleSaveResponseItem      saveCanonicals(canId)
    3961  handleSaveEditRec           saveCanonicals(can.id)
    7107  handleSaveRec               saveCanonicals(canId)
    7317  handleConfirmSaveToLibrary  saveCanonicals(canId)

Explicit ids, not a dirty-set. A dirty-set is state, state goes stale, and
stale state produced most of the bugs in this file. A caller that forgets gets
an exception rather than a silent whole-library write.

Rows belonging to another user are still excluded — that filter is unchanged
and still necessary.

## Measured

`simulation_suite/save-scope-sim.js` asserts the **payload row count**. The old
`rls-sim.js`, dropped after v0.65.0, mocked `upsert` as `{error:null}` and
asserted only *which* rows were sent, never *how many* — it would have passed
while a single save rewrote 95 rows.

    ORIGINAL   2 passed, 7 failed     "one save writes ONE row → wrote 95"
    PATCHED    9 passed, 0 failed

Including the one that matters: *a poisoned library does not break an unrelated
save.*

    node save-scope-sim.js --old     # control, must fail
    node save-scope-sim.js           # must pass

`node --check` clean. `APP_VERSION` → `v0.72.2 · live`.

## Correction to an earlier claim

I said `handleConfirmSaveToLibrary` calls `saveRecs()` at 7263 before
`saveCanonicals()` at 7289, and reproduced an FK error from that shape. Those
are mutually exclusive branches with a `return` between them. **That ordering
fault is not in this code.** The FK error I reproduced was real in the
simulator and does not correspond to this path.

## Not done

- `saveRecs` has the same whole-array fault.
- `saveMembers` (line ~1482) and `saveQueries` write whole arrays too.
- Whether a Tel Aviv pizzeria became an Indianapolis consultant is unexplained,
  and the identity migrations (0041/0042/0044) stay unarmed until it is.
