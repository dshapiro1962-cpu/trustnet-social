-- ═══ CANDIDATE D · fold on write, redirect on reference ═══════════════════
-- Two small triggers, neither of which any writer can forget:
--   canonicals  BEFORE INSERT  if this is a duplicate, mark it folded. The row
--                              is still written, so `returning id` is valid and
--                              the FK the writer is about to use holds.
--   recommendations BEFORE INSERT/UPDATE  point at the head, never a tombstone.
alter table canonicals add column if not exists merged_into uuid
  references canonicals(id) on delete set null;
create index if not exists canonicals_merged_into_idx
  on canonicals (merged_into) where merged_into is not null;

create or replace function canonical_head(p_id uuid) returns uuid language plpgsql stable as $fn$
declare v_id uuid := p_id; v_next uuid; i int := 0;
begin
  loop
    select merged_into into v_next from canonicals where id = v_id;
    exit when v_next is null or i >= 8;
    v_id := v_next; i := i + 1;
  end loop;
  return v_id;
end $fn$;

create or replace function canonicals_fold_on_write() returns trigger language plpgsql as $fn$
declare v uuid;
begin
  if new.merged_into is not null then return new; end if;
  v := match_canonical(new.name, new.location, new.phone);
  if v is not null and v <> new.id then
    new.merged_into := canonical_head(v);
  end if;
  return new;
end $fn$;
drop trigger if exists canonicals_fold_write_trg on canonicals;
create trigger canonicals_fold_write_trg before insert on canonicals
  for each row execute function canonicals_fold_on_write();

create or replace function recs_point_at_head() returns trigger language plpgsql as $fn$
begin
  new.canonical_id := canonical_head(new.canonical_id);
  return new;
end $fn$;
drop trigger if exists recs_head_trg on recommendations;
create trigger recs_head_trg before insert or update of canonical_id on recommendations
  for each row execute function recs_point_at_head();

-- match_canonical must never hand back a tombstone.
create or replace function match_canonical(p_name text, p_location text, p_phone text default null)
returns uuid language plpgsql stable as $fn$
declare v_id uuid; v_key text;
begin
  v_key := phone_key(p_phone);
  if v_key is not null and length(v_key) >= 9 then
    select id into v_id from public.canonicals
     where phone_key = v_key and merged_into is null limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from public.canonicals
   where merged_into is null
     and similarity(lower(name), lower(p_name)) > 0.45
     and (p_location is null or location is null
          or lower(location) = lower(p_location)
          or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
   order by similarity(lower(name), lower(p_name)) desc limit 1;
  return v_id;
end $fn$;
