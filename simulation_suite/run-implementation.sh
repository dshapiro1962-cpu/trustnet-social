#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# run-implementation.sh
#
# TWO PHASES, DELIBERATELY SEPARATE.
#
# The first version of this script ran the write-time guards against the
# production-shaped fixture and nine of them failed. The mechanism was fine:
# the guards insert 'Tony Vespa' and 'tony vespa' and assert the second folds
# into the FIRST — but that library already contains four Tony Vespas, so it
# folded into one of those instead. The guards were not isolated from the data
# they ran against.
#
# It also measured idempotency AFTER the backfill guards had inserted rows of
# their own, so the counts moved and the migration looked non-idempotent when
# it was not.
#
#   PHASE A · empty library   · 0041, write-time guards, neuter tests
#   PHASE B · 22 Aug library  · 0041, 0042, the numbers, idempotency,
#                               then the backfill guards LAST, because they write
# ═══════════════════════════════════════════════════════════════════════════
export PATH=/usr/lib/postgresql/16/bin:$PATH
cd "$(dirname "$0")"
P="psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1"
Q="psql -h /tmp -p 5433 -U postgres -tA"

line() { echo ""; echo "══ $1 ══"; }
counts() {
  $Q -c "select 'live '||(select count(*) from canonicals where merged_into is null)
              ||'   folded '||(select count(*) from canonicals where merged_into is not null)
              ||'   questions '||(select count(*) from canonical_fold_queue where status='pending')
              ||'   recs_on_tombstone '||(select count(*) from recommendations r
                   join canonicals c on c.id=r.canonical_id where c.merged_into is not null)
              ||'   live_without_kind '||(select count(*) from canonicals
                   where merged_into is null and kind is null);" 2>/dev/null | sed 's/^/  /'
}

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  PHASE A · write-time behaviour, empty library                     ║"
echo "╚════════════════════════════════════════════════════════════════════╝"

line "A1 · 0041, each statement on its own connection"
$P -f base.sql > /dev/null 2>&1
./sql-editor-runner.sh 0041_identity_on_write.sql 2>&1 | tail -1

line "A2 · write-time guards"
$Q -f identity_guards.sql 2>/dev/null | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' \
  | awk -F'|' '{printf "  passed %s, failed %s, total %s\n", $1, $2, $3}'
$Q -c "select '  FAILED: '||name from guard_results where not passed;" 2>/dev/null

line "A3 · neuter tests · every mechanism removed in turn"
./neuter-tests.sh 2>&1 | grep -E 'FAILED AS REQUIRED|STILL PASSED'

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║  PHASE B · the 22 Aug library                                      ║"
echo "╚════════════════════════════════════════════════════════════════════╝"

line "B1 · a pre-0041 library"
$P -f base.sql > /dev/null 2>&1
$P -c "alter table canonicals disable trigger all;" > /dev/null 2>&1
$P -f prod-shape.sql > /dev/null 2>&1
$P -c "alter table canonicals enable trigger all;" > /dev/null 2>&1
$Q -c "select '  '||count(*)||' canonicals, none folded' from canonicals;" 2>/dev/null

line "B2 · 0041 then 0042, each statement on its own connection"
./sql-editor-runner.sh 0041_identity_on_write.sql 2>&1 | tail -1
./sql-editor-runner.sh 0042_identity_backfill.sql 2>&1 | tail -1
counts

line "B3 · what it decided to fold, and what it decided to ask"
$Q -F' -> ' -c "select '  folded: '||c.name, h.name
                  from canonicals c join canonicals h on h.id = c.merged_into
                 order by h.name, c.name;" 2>/dev/null
$Q -F'  ?  ' -c "select '  asks: '||(select name from canonicals where id=q.candidate_id),
                        (select name from canonicals where id=q.head_id), q.score
                   from canonical_fold_queue q where q.status='pending' order by q.score desc;" 2>/dev/null

line "B4 · idempotency · both migrations again, every number must be unchanged"
BEFORE=$(counts)
./sql-editor-runner.sh 0041_identity_on_write.sql 2>&1 | tail -1
./sql-editor-runner.sh 0042_identity_backfill.sql 2>&1 | tail -1
AFTER=$(counts)
if [ "$BEFORE" = "$AFTER" ]; then echo "  unchanged:$AFTER"; else
  echo "  *** CHANGED ***"; echo "  before:$BEFORE"; echo "  after: $AFTER"; fi

line "B5 · backfill guards · run last, they write"
$Q -f identity_backfill_guards.sql 2>/dev/null | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' \
  | awk -F'|' '{printf "  passed %s, failed %s, total %s\n", $1, $2, $3}'
$Q -c "select '  FAILED: '||name from backfill_results where not passed;" 2>/dev/null
