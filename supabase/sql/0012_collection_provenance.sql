-- 0012: imported collection items carry their origin (label + link),
--       so a received list announces itself instead of arriving as loose items
alter table recommendations add column if not exists source_collection_id uuid
  references collections(id) on delete set null;
alter table recommendations add column if not exists source_label text;
-- verification: expect 2 rows
select column_name from information_schema.columns
where table_name = 'recommendations' and column_name in ('source_collection_id','source_label');
