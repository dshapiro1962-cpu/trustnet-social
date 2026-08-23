-- ═══════════════════════════════════════════════════════════════════════════
-- LIBRARY FIXTURE — dan's scenario, real schema, real column definitions.
--
--   x has y in x's "Italy" circle.
--   y has his own circle (called something else entirely — irrelevant by design).
--   y saves something Italian.
--   Does it reach x?
--
-- Every table definition copied from the migrations, not from memory:
-- canonicals + phone/phone_key (0001, 0020), recommendations (0001),
-- circle_interests (0026, 0027), suggestions (0028, 0031).
-- ═══════════════════════════════════════════════════════════════════════════
drop schema if exists public cascade; create schema public;
create extension if not exists pg_trgm;

create or replace function phone_key(p_raw text) returns text language sql immutable as $$
  select case
    when p_raw is null or length(regexp_replace(p_raw,'\D','','g')) = 0 then null
    when length(regexp_replace(p_raw,'\D','','g')) >= 9
      then right(regexp_replace(p_raw,'\D','','g'), 9)
    else regexp_replace(p_raw,'\D','','g') end; $$;

create table public.users (
  id uuid primary key, email text, phone text, name text);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete cascade,
  name text not null, linked_user_id uuid references public.users(id));

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null, domain text);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  contact_method text, contact_value text,
  linked_user_id uuid references public.users(id) on delete set null,
  person_id uuid references public.people(id) on delete cascade,
  created_at timestamptz not null default now());

create table public.canonicals (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('place','person','product','service','content')),
  name text not null, category text, location text, description text,
  image_emoji text default '📌',
  google_url text, website_url text, linkedin_url text,
  created_by uuid references public.users(id) on delete set null,
  verified boolean not null default false,
  -- 0014 librarian
  search_doc text, primary_category text, ai_tags text[],
  kind text,
  -- 0020 canonical_contact: phone is the identity anchor
  phone text,
  phone_key text generated always as (phone_key(phone)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create index canonicals_phone_key_idx on public.canonicals (phone_key) where phone_key is not null;

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.canonicals(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  owner_id uuid not null references public.users(id) on delete cascade,
  recommended_by_member_id uuid references public.members(id) on delete set null,
  recommended_by_user_id uuid references public.users(id) on delete set null,
  note text, rating smallint, tags text[] default '{}',
  status text default 'saved',
  is_anonymous boolean not null default false,
  shared_to_network boolean not null default true,
  degree smallint not null default 1,
  created_at timestamptz not null default now());

create table public.query_responses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  canonical_id uuid references public.canonicals(id) on delete set null,
  rec_name text, rec_note text,
  shared_to_network boolean not null default true,
  responded_at timestamptz);

create table public.circle_interests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  interest text not null,
  source text not null default 'confirmed' check (source in ('confirmed','declined')),
  is_custom boolean not null default false,
  terms text[] default '{}',
  created_at timestamptz not null default now());

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  canonical_id uuid not null references public.canonicals(id) on delete cascade,
  from_person_id uuid references public.people(id) on delete set null,
  from_user_id uuid references public.users(id) on delete set null,
  via text not null check (via in ('answer','save')),
  source_note text,
  matched_circles uuid[] not null default '{}'::uuid[],
  matched_interest text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now());

-- 0021: ONE match_canonical, phone beats name
create or replace function match_canonical(p_name text, p_location text, p_phone text default null)
returns uuid language plpgsql stable as $$
declare v_id uuid; v_key text;
begin
  v_key := phone_key(p_phone);
  if v_key is not null and length(v_key) >= 9 then
    select id into v_id from public.canonicals where phone_key = v_key limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from public.canonicals
   where similarity(lower(name), lower(p_name)) > 0.45
     and (p_location is null or location is null
          or lower(location) = lower(p_location)
          or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
   order by similarity(lower(name), lower(p_name)) desc limit 1;
  return v_id;
end $$;

-- ── THE SCENARIO ───────────────────────────────────────────────────────────
insert into public.users (id, email, name) values
 ('aaaaaaaa-0000-4000-8000-000000000001', 'x@example.com', 'X'),
 ('bbbbbbbb-0000-4000-8000-000000000002', 'y@example.com', 'Y');

-- X's circle. Y is a member of it, properly linked (post-v0.68 state).
insert into public.circles (id, owner_id, name, domain) values
 ('c1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Italy', 'travel');
insert into public.people (id, owner_id, name, linked_user_id) values
 ('d1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Y',
  'bbbbbbbb-0000-4000-8000-000000000002');
insert into public.members (id, circle_id, owner_id, name, contact_method, contact_value,
                            linked_user_id, person_id) values
 ('e1111111-0000-4000-8000-000000000001', 'c1111111-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001', 'Y', 'email', 'y@example.com',
  'bbbbbbbb-0000-4000-8000-000000000002', 'd1111111-0000-4000-8000-000000000001');

-- X has CONFIRMED an interest on that circle. Gate 4 needs this.
insert into public.circle_interests (circle_id, owner_id, interest, source) values
 ('c1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
  'restaurants', 'confirmed');

-- Y's OWN circle, called something else entirely. By design the sweep never
-- looks at it: "circles are provenance, not evidence".
insert into public.circles (id, owner_id, name, domain) values
 ('c2222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Bella Vita', 'travel');

