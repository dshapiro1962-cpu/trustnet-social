-- A production-shaped database: auth stand-ins, the real tables, RLS on,
-- production's policies, and a NON-SUPERUSER role. This is the environment
-- 0041 was never tested in.
drop schema if exists auth cascade;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('sim.uid', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('sim.role', true), ''), 'anon') $$;

drop table if exists public.canonical_resolution_log cascade;
drop table if exists public.canonical_fold_queue cascade;
drop table if exists public.recommendations cascade;
drop table if exists public.canonicals cascade;
create extension if not exists pg_trgm;

drop function if exists public.phone_key(text) cascade;
create or replace function public.phone_key(p text) returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p,''), '[^0-9]', '', 'g'), 9), '') $$;

create table public.canonicals (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'place', name text not null,
  category text, location text, description text, kind text,
  search_doc text, primary_category text, ai_tags text[],
  website_url text, image_emoji text, image_url text,
  phone text, phone_key text generated always as (public.phone_key(phone)) stored,
  created_by uuid, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.canonicals(id) on delete cascade,
  owner_id uuid not null, note text, circle_id uuid,
  created_at timestamptz not null default now());

alter table public.canonicals enable row level security;
create policy canonicals_read on public.canonicals for select using (auth.role() = 'authenticated');
create policy canonicals_insert on public.canonicals for insert with check (auth.role() = 'authenticated');
create policy canonicals_update_creator on public.canonicals for update
  using (created_by = auth.uid() or created_by is null) with check (created_by = auth.uid());
alter table public.recommendations enable row level security;
create policy recs_owner on public.recommendations for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Supabase's roles. `authenticated` holds the grants; the session role
-- inherits them. Supabase also grants on FUTURE tables by default, and
-- enables RLS on new public tables — both replicated below, because without
-- them the simulator fails in a different way than production does.
do $$ begin
  if exists (select 1 from pg_roles where rolname='app_user') then
    execute 'drop owned by app_user'; execute 'drop role app_user';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'drop owned by authenticated'; execute 'drop role authenticated';
  end if;
end $$;
create role authenticated;
create role app_user in role authenticated;
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
