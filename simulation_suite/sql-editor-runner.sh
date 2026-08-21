#!/bin/bash
# Runs a .sql file the way the Supabase editor does: EACH STATEMENT ON ITS OWN
# CONNECTION. No shared transaction, no temp tables surviving between them, and
# a failure leaves everything before it applied. psql -f does NOT behave this
# way, which is why 0036 passed here and half-applied on dan's database.
PGBIN=/usr/lib/postgresql/16/bin
FILE="$1"; STOP_AT="${2:-9999}"
rm -rf /tmp/stmts && mkdir -p /tmp/stmts
python3 - "$FILE" <<'PY'
import sys,re,os
s=open(sys.argv[1]).read()
s=re.sub(r'--[^\n]*','',s)
out=[];buf='';dollar=False
for line in s.split('\n'):
    if line.count('$$')%2==1: dollar = not dollar
    buf+=line+'\n'
    if not dollar and buf.strip().endswith(';'):
        if buf.strip(): out.append(buf.strip())
        buf=''
if buf.strip(): out.append(buf.strip())
for i,st in enumerate(out,1):
    open('/tmp/stmts/%03d.sql'%i,'w').write(st)
PY
n=0; fail=0
for f in /tmp/stmts/*.sql; do
  n=$((n+1)); [ $n -gt $STOP_AT ] && { echo "  [$n] -- stopped here deliberately"; break; }
  out=$(su postgres -c "$PGBIN/psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1 -f $f" 2>&1)
  if echo "$out" | grep -q "ERROR"; then
    echo "  [$n] FAILED: $(echo "$out" | grep ERROR | head -1 | cut -c1-100)"
    echo "        stmt: $(head -2 "$f" | tr '\n' ' ' | cut -c1-80)"
    fail=$((fail+1))
  else
    echo "  [$n] ok  $(head -1 "$f" | cut -c1-62)"
  fi
done
echo "  ($n statements, failures: $fail)"
