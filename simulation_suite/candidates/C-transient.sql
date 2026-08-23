-- ═══ CANDIDATE C · transient columns on recommendations ═══════════════════
-- The writer supplies name/location/phone alongside the rec; a before-insert
-- trigger resolves the canonical, writes it if needed, and nulls the columns.
alter table recommendations add column if not exists in_name text;
alter table recommendations add column if not exists in_location text;
alter table recommendations add column if not exists in_phone text;
alter table recommendations add column if not exists in_kind text;
alter table recommendations alter column canonical_id drop not null;

create or replace function recs_resolve_canonical() returns trigger language plpgsql as $fn$
declare v uuid;
begin
  if new.in_name is not null then
    v := match_canonical(new.in_name, new.in_location, new.in_phone);
    if v is null then
      insert into canonicals (type, name, location, phone, kind, created_by)
      values ('place', new.in_name, new.in_location, new.in_phone, new.in_kind, new.owner_id)
      returning id into v;
    end if;
    new.canonical_id := v;
  end if;
  new.in_name := null; new.in_location := null; new.in_phone := null; new.in_kind := null;
  return new;
end $fn$;
drop trigger if exists recs_resolve_trg on recommendations;
create trigger recs_resolve_trg before insert on recommendations
  for each row execute function recs_resolve_canonical();
