-- report.sql — the same measurements for every candidate.
do $$
declare
  has_merged boolean;
  v_rows int; v_heads int; v_recs int; v_recs_on_heads int;
  v_carriers int; r record;
begin
  select exists (select 1 from information_schema.columns
                  where table_name = 'canonicals' and column_name = 'merged_into')
    into has_merged;

  select count(*) into v_rows from canonicals;
  if has_merged then
    execute 'select count(*) from canonicals where merged_into is null' into v_heads;
  else
    v_heads := v_rows;
  end if;
  select count(*) into v_recs from recommendations;
  if has_merged then
    execute 'select count(*) from recommendations r join canonicals c on c.id = r.canonical_id
              where c.merged_into is null' into v_recs_on_heads;
  else
    v_recs_on_heads := v_recs;
  end if;
  -- how many DISTINCT canonicals actually carry a recommendation: this is the
  -- number of suggestion cards the sweep can emit for one restaurant.
  select count(*) into v_carriers from (
    select canonical_id from recommendations group by canonical_id) s;

  raise notice '  canonical rows                 : %', v_rows;
  raise notice '  of which live (not folded)     : %', v_heads;
  raise notice '  recommendations                : % (% on live canonicals)', v_recs, v_recs_on_heads;
  raise notice '  DISTINCT canonicals carrying a rec : %   <- suggestion cards for one restaurant', v_carriers;
  raise notice '  writers:';
  for r in select writer, ok, detail from replay_log order by seq loop
    raise notice '    %  %  %', rpad(r.writer, 26), case when r.ok then 'ok    ' else 'FAILED' end, left(r.detail, 76);
  end loop;
end $$;
