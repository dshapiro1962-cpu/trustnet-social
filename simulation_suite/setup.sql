drop schema if exists auth cascade;
create schema auth;
-- stand-in for Supabase's auth.uid() / auth.role(), driven by a GUC so the
-- simulator can be any user it likes.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('sim.uid', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('sim.role', true), ''), 'anon') $$;

drop table if exists public.canonicals cascade;
create table public.canonicals (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'place',
  name text not null,
  category text, location text, description text,
  website_url text, image_emoji text, image_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- THE THREE POLICIES EXACTLY AS PRODUCTION HAS THEM (read back 23 Aug)
alter table public.canonicals enable row level security;
create policy canonicals_read on public.canonicals
  for select using (auth.role() = 'authenticated');
create policy canonicals_insert on public.canonicals
  for insert with check (auth.role() = 'authenticated');
create policy canonicals_update_creator on public.canonicals
  for update using (created_by = auth.uid());

drop role if exists app_user;
create role app_user;
grant usage on schema public, auth to app_user;
grant select, insert, update, delete on public.canonicals to app_user;
