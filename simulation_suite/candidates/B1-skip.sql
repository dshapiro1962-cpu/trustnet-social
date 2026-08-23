-- ═══ CANDIDATE B1 · before-insert trigger on canonicals, RETURN NULL ═══════
-- "fold into the existing one" expressed the obvious way: refuse the insert.
create or replace function canonicals_dedup() returns trigger language plpgsql as $fn$
declare v uuid;
begin
  v := match_canonical(new.name, new.location, new.phone);
  if v is not null and v <> new.id then
    return null;             -- skip the insert; the existing canonical stands
  end if;
  return new;
end $fn$;
drop trigger if exists canonicals_dedup_trg on canonicals;
create trigger canonicals_dedup_trg before insert on canonicals
  for each row execute function canonicals_dedup();
