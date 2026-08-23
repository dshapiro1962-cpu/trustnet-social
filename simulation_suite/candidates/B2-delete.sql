-- ═══ CANDIDATE B2 · after-insert trigger on canonicals, DELETE the dupe ════
-- dedup after the fact, as the note describes it: merge once a duplicate exists.
create or replace function canonicals_fold_after() returns trigger language plpgsql as $fn$
declare v uuid;
begin
  select id into v from canonicals
   where id <> new.id
     and (
       (phone_key is not null and phone_key = phone_key(new.phone))
       or (similarity(lower(name), lower(new.name)) > 0.45
           and (new.location is null or location is null
                or lower(location) = lower(new.location)))
     )
   order by created_at asc limit 1;
  if v is not null then
    update recommendations set canonical_id = v where canonical_id = new.id;
    delete from canonicals where id = new.id;
  end if;
  return null;
end $fn$;
drop trigger if exists canonicals_fold_trg on canonicals;
create trigger canonicals_fold_trg after insert on canonicals
  for each row execute function canonicals_fold_after();
