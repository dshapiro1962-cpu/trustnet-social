#!/bin/bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
cd /home/claude/rls
P="psql -h /tmp -p 5433 -U postgres -tA"
run () {
  local label="$1"; local policy="$2"
  psql -h /tmp -p 5433 -U postgres -q -f setup.sql >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "drop policy if exists canonicals_update_creator on public.canonicals;" >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "$policy" >/dev/null 2>&1
  psql -h /tmp -p 5433 -U postgres -q -c "insert into public.canonicals (id,type,name,created_by) values ('11111111-0000-4000-8000-000000000001','place','Server row',null),('22222222-0000-4000-8000-000000000002','place','Someone elses','eeeeeeee-0000-4000-8000-000000000009');" >/dev/null 2>&1
  echo "── $label"
  cat > /tmp/t1.sql <<'EOF'
set role app_user;
set sim.uid='dddddddd-0000-4000-8000-000000000001';
set sim.role='authenticated';
insert into public.canonicals (id,type,name,location,created_by) values
 ('11111111-0000-4000-8000-000000000001','place','Server row',null,'dddddddd-0000-4000-8000-000000000001'),
 (gen_random_uuid(),'place','Hummus Arafat','Jerusalem','dddddddd-0000-4000-8000-000000000001')
on conflict (id) do update set name=excluded.name, location=excluded.location;
EOF
  local err
  err=$(psql -h /tmp -p 5433 -U postgres -q -f /tmp/t1.sql 2>&1 | grep -c 'ERROR')
  [ "$err" -gt 0 ] && echo "     batch: REFUSED" || echo "     batch: accepted"
  echo "     Hummus Arafat saved: $($P -c "select count(*) from public.canonicals where name='Hummus Arafat'")"
  cat > /tmp/t2.sql <<'EOF'
set role app_user;
set sim.uid='dddddddd-0000-4000-8000-000000000001';
set sim.role='authenticated';
update public.canonicals set name='HIJACKED' where id='22222222-0000-4000-8000-000000000002';
EOF
  psql -h /tmp -p 5433 -U postgres -q -f /tmp/t2.sql >/dev/null 2>&1
  echo "     can rewrite another user's place: $($P -c "select case when name='HIJACKED' then 'YES' else 'no' end from public.canonicals where id='22222222-0000-4000-8000-000000000002'")"
  echo ""
}
run "A · today's policy (control)" "create policy canonicals_update_creator on public.canonicals for update using (created_by = auth.uid());"
run "B · owner OR unowned, plus a WITH CHECK" "create policy canonicals_update_creator on public.canonicals for update using (created_by = auth.uid() or created_by is null) with check (auth.role() = 'authenticated');"
run "C · shared table: any authenticated user may update" "create policy canonicals_update_creator on public.canonicals for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');"
