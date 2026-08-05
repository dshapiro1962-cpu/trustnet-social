-- 0013: notifications can carry a tappable link (collection shares, future deep links)
alter table notifications add column if not exists link_url text;
-- verification: expect 1 row
select column_name from information_schema.columns
where table_name = 'notifications' and column_name = 'link_url';
