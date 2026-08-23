-- ═══ CANDIDATE A · an RPC every writer must call ═══════════════════════════
-- save_recommendation resolves the canonical and writes both rows in one
-- transaction. Correct and atomic. Whether it is REMEMBERED is the test.
create or replace function save_recommendation(
  p_owner uuid, p_name text, p_location text, p_phone text default null,
  p_note text default null, p_circle uuid default null,
  p_kind text default null, p_type text default 'place')
returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  v_id := match_canonical(p_name, p_location, p_phone);
  if v_id is null then
    insert into canonicals (type, name, location, phone, kind, created_by)
    values (p_type, p_name, p_location, p_phone, p_kind, p_owner)
    returning id into v_id;
  elsif p_kind is not null then
    update canonicals set kind = coalesce(kind, p_kind), updated_at = now()
     where id = v_id;
  end if;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, p_owner, p_note, p_circle);
  return v_id;
end $fn$;
