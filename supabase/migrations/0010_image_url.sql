-- 0010: og:image thumbnails on canonicals (Task 5 triage tray / library cards)
alter table canonicals add column if not exists image_url text;
-- verification marker (run output should show one row: image_url | text)
select column_name, data_type from information_schema.columns
where table_name = 'canonicals' and column_name = 'image_url';
