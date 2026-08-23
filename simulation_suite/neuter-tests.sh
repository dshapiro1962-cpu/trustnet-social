#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# neuter-tests.sh — the guards' own test.
#
# Each run below removes or breaks ONE mechanism, then runs identity_guards.sql
# and requires it to FAIL. A guard that still passes with its mechanism gone is
# testing its own spelling. Every line here must say FAILED AS REQUIRED.
# ═══════════════════════════════════════════════════════════════════════════
export PATH=/usr/lib/postgresql/16/bin:$PATH
cd "$(dirname "$0")"
P="psql -h /tmp -p 5433 -U postgres -q -v ON_ERROR_STOP=1"

run() {
  local label="$1"; local sabotage="$2"
  $P -f base.sql                       > /dev/null 2>&1
  $P -f 0041_identity_on_write.sql     > /dev/null 2>&1
  $P -c "$sabotage"                    > /dev/null 2>&1
  local failed
  failed=$(psql -h /tmp -p 5433 -U postgres -tA -f identity_guards.sql 2>/dev/null \
           | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' | cut -d'|' -f2)
  failed=${failed:-0}
  if [ "$failed" -gt 0 ]; then
    printf '  %-58s FAILED AS REQUIRED (%s guards)\n' "$label" "$failed"
  else
    printf '  %-58s *** STILL PASSED — THE GUARD IS WORTHLESS ***\n' "$label"
  fi
}

echo "── control: nothing sabotaged, the suite must pass ──"
$P -f base.sql > /dev/null 2>&1
$P -f 0041_identity_on_write.sql > /dev/null 2>&1
psql -h /tmp -p 5433 -U postgres -tA -f identity_guards.sql 2>/dev/null \
  | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' \
  | awk -F'|' '{printf "  passed %s, failed %s, total %s\n", $1, $2, $3}'

echo ""
echo "── each mechanism removed in turn ──"

run "tier 1+2 trigger dropped" \
    "drop trigger canonicals_identity_fold_trg on canonicals;"

run "tier 3 enqueue trigger dropped" \
    "drop trigger canonicals_identity_enqueue_trg on canonicals;"

run "the redirect on recommendations dropped" \
    "drop trigger recs_point_at_head_trg on recommendations;"

run "norm_name neutered to identity (nothing normalises)" \
    "create or replace function norm_name(p_text text) returns text language sql immutable as \$\$ select p_text; \$\$;"

run "norm_name over-normalised to first 3 chars (folds everything)" \
    "create or replace function norm_name(p_text text) returns text language sql immutable as \$\$ select left(lower(btrim(p_text)),3); \$\$;"

run "tier 2 phone length check removed (any digits are 'proof')" \
    "create or replace function canonicals_identity_fold() returns trigger language plpgsql as \$f\$
     declare v_head uuid; v_key text;
     begin
       if new.merged_into is not null then return new; end if;
       select id into v_head from canonicals where merged_into is null and id <> new.id
         and norm_name(name) = norm_name(new.name) order by created_at limit 1;
       if v_head is not null then new.merged_into := canonical_head(v_head); return new; end if;
       v_key := phone_key(new.phone);
       if v_key is not null then
         select id into v_head from canonicals where merged_into is null and id <> new.id
           and phone_key = v_key order by created_at limit 1;
         if v_head is not null then new.merged_into := canonical_head(v_head); end if;
       end if;
       return new;
     end \$f\$;"

run "resolve_fold ignores 'keep apart' and folds anyway" \
    "create or replace function resolve_fold(p_queue_id uuid, p_same boolean, p_by uuid default null)
     returns uuid language plpgsql as \$f\$
     declare q record; begin
       select * into q from canonical_fold_queue where id = p_queue_id and status='pending';
       if not found then return null; end if;
       update canonicals set merged_into = canonical_head(q.head_id) where id = q.candidate_id;
       update canonical_fold_queue set status='folded' where id = q.id;
       return null;
     end \$f\$;"

run "unmerge restores the recs BEFORE clearing the pointer" \
    "create or replace function unmerge(p_event_id uuid, p_by uuid default null)
     returns int language plpgsql as \$f\$
     declare r record; n int := 0; v_canonical uuid; begin
       for r in select rec_id, prev_canonical_id from canonical_resolution_log
                 where event_id = p_event_id and rec_id is not null loop
         update recommendations set canonical_id = r.prev_canonical_id where id = r.rec_id;
         n := n + 1;
       end loop;
       select canonical_id into v_canonical from canonical_resolution_log
        where event_id = p_event_id and canonical_id is not null limit 1;
       update canonicals set merged_into = null where id = v_canonical;
       return n;
     end \$f\$;"

run "the redirect stops writing to the log (folds silently, invisibly)" \
    "create or replace function recs_point_at_head() returns trigger language plpgsql as \$f\$
     begin new.canonical_id := canonical_head(new.canonical_id); return new; end \$f\$;"
