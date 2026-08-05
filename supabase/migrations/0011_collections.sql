-- 0011: Collections — shareable curated lists (the acquisition wedge)
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  rec_id uuid not null references recommendations(id) on delete cascade,
  position int not null default 0,
  unique (collection_id, rec_id)
);
alter table collections enable row level security;
alter table collection_items enable row level security;
drop policy if exists col_owner_all on collections;
create policy col_owner_all on collections
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ci_owner_all on collection_items;
create policy ci_owner_all on collection_items
  for all using (exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from collections c where c.id = collection_id and c.owner_id = auth.uid()));
-- verification: expect  collections_ready | 2
select 'collections_ready' as marker, count(*) as tables
from information_schema.tables where table_name in ('collections','collection_items');
