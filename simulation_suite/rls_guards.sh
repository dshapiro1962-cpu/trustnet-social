#!/bin/bash
# rls_guards.sh — real role, real policies, real Postgres. No mocks.
# rls-sim.js returned {error:null} from a fake upsert and would have passed
# every one of these while production 403'd.
export PATH=/usr/lib/postgresql/16/bin:$PATH
cd /home/claude/rls
Q="psql -h /tmp -p 5433 -U postgres -tA"
pass=0; fail=0
ck () { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-58s\n' "$1";
        else fail=$((fail+1)); printf '  FAIL  %-58s got %s want %s\n' "$1" "$2" "$3"; fi }

seed () {
  psql -h /tmp -p 5433 -U postgres -q -f setup.sql >/dev/null 2>&1
  [ -n "$1" ] && psql -h /tmp -p 5433 -U postgres -q -f "$1" >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "insert into public.canonicals (id,type,name,created_by) values
    ('11111111-0000-4000-8000-000000000001','place','Server row · unsigned', null),
    ('22222222-0000-4000-8000-000000000002','place','Abu Hassan · Dans','dddddddd-0000-4000-8000-000000000001'),
    ('33333333-0000-4000-8000-000000000003','place','Yossis place','eeeeeeee-0000-4000-8000-000000000009');" >/dev/null 2>&1
}
as_dan () { printf "set role app_user;\nset sim.uid='dddddddd-0000-4000-8000-000000000001';\nset sim.role='authenticated';\n%s\n" "$1" > /tmp/q.sql
            psql -h /tmp -p 5433 -U postgres -q -f /tmp/q.sql 2>&1 | grep -c ERROR; }
as_yossi () { printf "set role app_user;\nset sim.uid='eeeeeeee-0000-4000-8000-000000000009';\nset sim.role='authenticated';\n%s\n" "$1" > /tmp/q.sql
            psql -h /tmp -p 5433 -U postgres -q -f /tmp/q.sql 2>&1 | grep -c ERROR; }

# Faithful to PostgREST: .upsert() sets EVERY column in the payload, and the
# client's payload includes created_by. A DO UPDATE SET that omits created_by
# is not what the app sends, and testing that shape tests nothing real.
BATCH="insert into public.canonicals (id,type,name,location,created_by) values
 ('11111111-0000-4000-8000-000000000001','place','Server row · unsigned',null,'dddddddd-0000-4000-8000-000000000001'),
 (gen_random_uuid(),'place','Hummus Arafat','Jerusalem','dddddddd-0000-4000-8000-000000000001')
 on conflict (id) do update set name=excluded.name, location=excluded.location,
   created_by=excluded.created_by;"

echo "── CONTROL · today's policy · the suite MUST fail here ──"
seed ""
r=$(as_dan "$BATCH")
ck "control · Dans batch is refused"                "$r" "1"
ck "control · Hummus Arafat is lost"                "$($Q -c "select count(*) from public.canonicals where name='Hummus Arafat'")" "0"

echo ""
echo "── 0043 applied ──"
seed 0043_canonicals_update_policy.sql
r=$(as_dan "$BATCH")
ck "the batch is accepted"                          "$r" "0"
ck "Hummus Arafat is saved"                         "$($Q -c "select count(*) from public.canonicals where name='Hummus Arafat'")" "1"
ck "the unsigned row is now signed by Dan"          "$($Q -c "select created_by='dddddddd-0000-4000-8000-000000000001' from public.canonicals where id='11111111-0000-4000-8000-000000000001'")" "t"

echo ""
echo "── NEGATIVE · none of these may happen ──"
as_yossi "update public.canonicals set name='HIJACKED' where id='22222222-0000-4000-8000-000000000002';" >/dev/null
ck "NEG · Yossi cannot rewrite Dans place"          "$($Q -c "select name from public.canonicals where id='22222222-0000-4000-8000-000000000002'")" "Abu Hassan · Dans"
as_dan "update public.canonicals set name='HIJACKED' where id='33333333-0000-4000-8000-000000000003';" >/dev/null
ck "NEG · Dan cannot rewrite Yossis place"          "$($Q -c "select name from public.canonicals where id='33333333-0000-4000-8000-000000000003'")" "Yossis place"
seed 0043_canonicals_update_policy.sql
as_dan "update public.canonicals set created_by='eeeeeeee-0000-4000-8000-000000000009' where id='22222222-0000-4000-8000-000000000002';" >/dev/null
ck "NEG · with check stops giving a row away"       "$($Q -c "select created_by='dddddddd-0000-4000-8000-000000000001' from public.canonicals where id='22222222-0000-4000-8000-000000000002'")" "t"
seed 0043_canonicals_update_policy.sql
as_dan "insert into public.canonicals (id,type,name) values ('11111111-0000-4000-8000-000000000001','place','No created_by sent') on conflict (id) do update set name=excluded.name;" >/dev/null
ck "NEG · a writer that does not stamp created_by is refused" "$($Q -c "select name from public.canonicals where id='11111111-0000-4000-8000-000000000001'")" "Server row · unsigned"
r=$(printf "set role app_user;\nset sim.role='anon';\ninsert into public.canonicals (type,name) values ('place','Anon row');\n" > /tmp/q.sql; psql -h /tmp -p 5433 -U postgres -q -f /tmp/q.sql 2>&1 | grep -c ERROR)
ck "NEG · an unauthenticated write is still refused" "$r" "1"

echo ""
echo "  passed $pass, failed $fail"
