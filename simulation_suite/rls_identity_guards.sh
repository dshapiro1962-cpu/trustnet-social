#!/bin/bash
# rls_identity_guards.sh — the case NOTHING was tested against on 23 Aug:
# a non-superuser, RLS enabled, Supabase's role layout, triggers ARMED.
# Everything in identity_guards.sql ran as postgres with RLS off, which is why
# 0041 shipped a table with no grants and broke saving the moment it was armed.
export PATH=/usr/lib/postgresql/16/bin:$PATH
cd /home/claude/rls
Q="psql -h /tmp -p 5433 -U postgres -tA"
pass=0; fail=0
ck () { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  ok    %-56s\n' "$1";
        else fail=$((fail+1)); printf '  FAIL  %-56s got [%s] want [%s]\n' "$1" "$2" "$3"; fi }
build () {  # $1 = apply 0044 or not
  psql -h /tmp -p 5433 -U postgres -q -f full_setup.sql >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -f /home/claude/sim/0041_identity_on_write.sql >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "alter table public.canonical_resolution_log enable row level security;
    alter table public.canonical_fold_queue enable row level security;" >/dev/null 2>&1
  [ "$1" = "0044" ] && psql -h /tmp -p 5433 -U postgres -q -f 0044_identity_security_definer.sql >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -f arm.sql >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "insert into public.canonicals (id,type,name,created_by) values
    ('aaaa1111-0000-4000-8000-000000000001','place','Tony Vespa','dddddddd-0000-4000-8000-000000000001');" >/dev/null 2>&1
}
run_as () { printf "set role app_user;\nset sim.uid='%s';\nset sim.role='authenticated';\n%s\n" "$1" "$2" > /tmp/r.sql
            psql -h /tmp -p 5433 -U postgres -q -f /tmp/r.sql 2>&1 | grep -c 'ERROR'; }
DAN='dddddddd-0000-4000-8000-000000000001'
SAVE="insert into public.canonicals (id,type,name,created_by) values (gen_random_uuid(),'place','tony vespa','$DAN');"

echo "── CONTROL · 0041 armed WITHOUT 0044 · the suite must fail here ──"
build none
ck "control · an ordinary save is refused"        "$(run_as $DAN "$SAVE")" "1"
ck "control · nothing was written"                "$($Q -c "select count(*) from public.canonicals where name='tony vespa'")" "0"

echo ""
echo "── 0044 applied ──"
build 0044
ck "the save is accepted"                          "$(run_as $DAN "$SAVE")" "0"
ck "and it folded into the live row"               "$($Q -c "select count(*) from public.canonicals where name='tony vespa' and merged_into is not null")" "1"
ck "the fold was logged"                           "$($Q -c "select count(*) from public.canonical_resolution_log where tier='norm_exact'")" "1"
run_as $DAN "insert into public.recommendations (canonical_id, owner_id, note) select id,'$DAN','blind' from public.canonicals where merged_into is not null limit 1;" >/dev/null
ck "a rec written blind lands on the live row"     "$($Q -c "select count(*) from public.recommendations r join public.canonicals c on c.id=r.canonical_id where c.merged_into is null")" "1"
ck "all five functions are security definer"       "$($Q -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname in ('canonicals_identity_fold','canonicals_identity_enqueue','recs_point_at_head','resolve_fold','unmerge')")" "5"
ck "and all five pin search_path"                  "$($Q -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proconfig is not null and p.proname in ('canonicals_identity_fold','canonicals_identity_enqueue','recs_point_at_head','resolve_fold','unmerge')")" "5"

echo ""
echo "── NEGATIVE · the audit log must not be forgeable ──"
ck "NEG · the app cannot write to the log directly"   "$(run_as $DAN "insert into public.canonical_resolution_log (event_id,tier,detail) values (gen_random_uuid(),'norm_exact','forged');")" "1"
# With only a select policy a DELETE does not error - it silently removes
# nothing. Assert the ROW COUNT, never the absence of an error.
BEFORE=$($Q -c "select count(*) from public.canonical_resolution_log")
run_as $DAN "delete from public.canonical_resolution_log;" >/dev/null
ck "NEG · the app cannot delete log rows"             "$($Q -c "select count(*) from public.canonical_resolution_log")" "$BEFORE"
ck "NEG · the app cannot answer a question by hand"   "$(run_as $DAN "insert into public.canonical_fold_queue (candidate_id,head_id,candidate_norm,head_norm,score) values (gen_random_uuid(),gen_random_uuid(),'a','b',0.9);")" "1"
ck "NEG · the app CAN read the log"                   "$(run_as $DAN "select count(*) from public.canonical_resolution_log;")" "0"

echo ""
echo "  passed $pass, failed $fail"
