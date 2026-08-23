#!/bin/bash
# run-candidate.sh <candidate.sql|none> <label> [writers-override.sql]
# Fresh database, apply the candidate, replay every writer, measure.
export PATH=/usr/lib/postgresql/16/bin:$PATH
P="psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1"
CAND="$1"; LABEL="$2"; OVERRIDE="$3"
cd "$(dirname "$0")"
echo ""
echo "══════════════════════════════════════════════════════════════════════"
echo "  $LABEL"
echo "══════════════════════════════════════════════════════════════════════"
$P -f base.sql 2>/dev/null
$P -f writers.sql 2>/dev/null
if [ "$CAND" != "none" ]; then
  $P -f "$CAND" || { echo "  CANDIDATE FAILED TO APPLY"; exit 1; }
fi
[ -n "$OVERRIDE" ] && $P -f "$OVERRIDE"
for w in w1 w2 w3 w4 w5 w6; do
  $P -c "select $w();" > /dev/null 2>&1 || echo "  $w aborted outright"
done
psql -h /tmp -p 5433 -U postgres -q -f report.sql 2>&1 | sed 's/^NOTICE:  //'
echo "  ── the sweep ──"
MATCH_ON=${MATCH_ON:-kind} GATE2=${GATE2:-hard} node sweep-sim.js 2>/dev/null | sed -n '/DELIVERED\|DROPPED\|counters/p' | sed 's/^/  /'
