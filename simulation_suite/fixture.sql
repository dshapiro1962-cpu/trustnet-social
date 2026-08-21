-- ═══════════════════════════════════════════════════════════════════════════
-- FIXTURE — the real schema (0001 + 0017 + 0022) and dan's real rows.
-- Column definitions copied verbatim from the migrations, not from memory.
-- ═══════════════════════════════════════════════════════════════════════════
drop schema if exists public cascade; create schema public;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function phone_key(p_raw text) returns text language sql immutable as $$
  select case
    when p_raw is null or length(regexp_replace(p_raw,'\D','','g')) = 0 then null
    when length(regexp_replace(p_raw,'\D','','g')) >= 9
      then right(regexp_replace(p_raw,'\D','','g'), 9)
    else regexp_replace(p_raw,'\D','','g') end; $$;

create or replace function public.contact_key(p_method text, p_value text)
returns text language sql immutable as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    when p_method = 'whatsapp' then phone_key(p_value)
    else lower(btrim(p_value)) end; $$;

create table public.users (
  id uuid primary key, email text, phone text, phone_key text,
  name text, avatar text, avatar_color text default '#217A4B');

create table public.circles (
  id uuid primary key, owner_id uuid not null references public.users(id) on delete cascade,
  name text not null);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null, avatar text, avatar_color text default '#217A4B',
  linked_user_id uuid references public.users(id) on delete set null,
  response_rate text default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());

create table public.person_contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  method text not null check (method in ('email','whatsapp','linkedin')),
  value text not null, key text not null,
  created_at timestamptz not null default now());
create unique index person_contacts_identity_uniq
  on public.person_contacts (owner_id, method, key);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null, avatar text, avatar_color text default '#217A4B',
  trust_basis text check (char_length(trust_basis) <= 400),
  contact_method text check (contact_method in ('app','whatsapp','email','linkedin','source')),
  contact_value text,
  response_rate text check (response_rate in ('high','medium','low','unknown')) default 'unknown',
  is_external_source boolean not null default false,
  source_type text check (source_type in ('critic','publication','newsletter','expert')),
  source_url text,
  linked_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- GENERATED, exactly as 0017 defines it. Declaring this as plain text made
  -- every test pass against a schema that was not production's.
  contact_key text generated always as (
    case when contact_method = 'whatsapp' then phone_key(contact_value)
         when contact_method = 'email'    then lower(trim(contact_value))
         else null end) stored,
  person_id uuid references public.people(id) on delete cascade);
create trigger trg_members_updated before update on public.members
  for each row execute function set_updated_at();

-- all three tables that point at a member (on delete set null — silent loss)
create table public.query_responses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null, body text);
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  recommended_by_member_id uuid references public.members(id) on delete set null, name text);
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null, invite_token text);


-- the wrong trigger that is live in production today
create or replace function public.link_member_row() returns trigger
language plpgsql security definer as $$
begin
  if new.linked_user_id is null and new.contact_value is not null then
    select id into new.linked_user_id from public.users
     where lower(email) = lower(new.contact_value) or phone = new.contact_value
     limit 1;
  end if;
  return new;
end $$;
create trigger trg_members_autolink before insert or update on public.members
  for each row execute function public.link_member_row();

-- ── DATA ───────────────────────────────────────────────────────────────────
insert into public.users (id, email, phone, name) values
 ('e3ba6e76-494e-449c-a56f-1b42b43bdf7d','itamarshapiro@gmail.com',null,'Itamar'),
 ('c7af8222-f595-455b-83d4-d848a8bd621a','dshapiro1962@gmail.com','0505543402','dan'),
 ('016af977-9239-40db-81b0-13761f68ed0c','dany@example.com',null,'Dany'),
 ('acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','dshapiro3012@gmail.com',null,'dan test'),
 ('11111111-1111-1111-1111-111111111111','dshari08@hotmail.com',null,'yossi');

insert into public.circles (id, owner_id, name) values
 ('437e6c70-4a0f-470b-b616-d3789d43052c','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','Italy Trip'),
 ('a763ae16-053c-493a-b9d2-cd77f5c684fc','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','other'),
 ('0aa0afc8-95f3-4589-92bf-48f25ecbfbd2','c7af8222-f595-455b-83d4-d848a8bd621a','test circle'),
 ('1e6fda4b-157d-4f22-b428-bdd7200ddd72','c7af8222-f595-455b-83d4-d848a8bd621a','dining'),
 ('05839ac0-26ae-4061-be3f-bbd01b74c527','c7af8222-f595-455b-83d4-d848a8bd621a','ski'),
 ('af345516-ccfb-41b9-90cf-9acc5bfff2f9','c7af8222-f595-455b-83d4-d848a8bd621a','health'),
 ('46fb2225-9561-4559-9e9c-019fa9504a27','016af977-9239-40db-81b0-13761f68ed0c','c1'),
 ('c1b5e01c-33e5-402a-8be3-b77ce5e7ca6f','016af977-9239-40db-81b0-13761f68ed0c','c2'),
 ('06fd4bcb-495a-4317-8913-4b677ca2b0f1','acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','c3');

-- people that already hold the contact (the mode-2 case)
insert into public.people (id, owner_id, name) values
 ('0c2d2051-779b-4a8e-8de0-9770a5f8d48d','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','Dan Shapiro'),
 ('69011a23-4f60-4784-ae82-210b22a97b0f','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','dshapiro3012@gmail.com'),
 ('4d9b5e97-c416-47cc-b979-de93af52350e','c7af8222-f595-455b-83d4-d848a8bd621a','shapiro'),
 ('39010857-b5f2-4106-9e5d-0c79a050da99','c7af8222-f595-455b-83d4-d848a8bd621a','Itamar'),
 ('db85d42d-900f-40ba-95ca-b8f945d7546a','016af977-9239-40db-81b0-13761f68ed0c','Dany'),
 ('5d3e52b5-3538-4bcb-bf19-351fa8ed8c17','016af977-9239-40db-81b0-13761f68ed0c','dan test2'),
 ('8221e61a-546a-43d3-b0a5-f230e435989b','acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','dan test1'),
 ('27b4f8b9-413c-4354-a4fa-4e26f56747f1','acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','daj'),
 ('aaaaaaaa-0000-4000-8000-000000000001','c7af8222-f595-455b-83d4-d848a8bd621a','yossi');

insert into public.person_contacts (person_id, owner_id, method, value, key) values
 ('0c2d2051-779b-4a8e-8de0-9770a5f8d48d','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','whatsapp','+972505543402','505543402'),
 ('aaaaaaaa-0000-4000-8000-000000000001','c7af8222-f595-455b-83d4-d848a8bd621a','email','dshari08@hotmail.com','dshari08@hotmail.com');

-- the duplicate pair: same owner, same circle, same contact, BOTH person_id null
insert into public.members (id, circle_id, owner_id, name, avatar, avatar_color,
       contact_method, contact_value, response_rate, created_at) values
 ('a11092a6-8e90-4d21-a3fd-0e9438b336b2','0aa0afc8-95f3-4589-92bf-48f25ecbfbd2',
  'c7af8222-f595-455b-83d4-d848a8bd621a','Chain Answerer','CA','#1A6FA8',
  'email','dshari08@hotmail.com','high','2026-08-19 07:21+00'),
 ('4adb6127-6f27-42cb-b8cc-3b1afae1c26f','0aa0afc8-95f3-4589-92bf-48f25ecbfbd2',
  'c7af8222-f595-455b-83d4-d848a8bd621a','yossi','Y','#C0392B',
  'email','dshari08@hotmail.com','high','2026-08-19 14:27+00');

-- the two members whose contact is NOT registered
insert into public.members (id, circle_id, owner_id, name, avatar, avatar_color,
       contact_method, contact_value, response_rate) values
 ('bbbbbbbb-0000-4000-8000-000000000001','1e6fda4b-157d-4f22-b428-bdd7200ddd72',
  'c7af8222-f595-455b-83d4-d848a8bd621a','dan','D','#E8A020','email','dshapiro8@hotmail.com','high'),
 ('bbbbbbbb-0000-4000-8000-000000000002','437e6c70-4a0f-470b-b616-d3789d43052c',
  'e3ba6e76-494e-449c-a56f-1b42b43bdf7d','Biriz Ozkan','BO','#8B2FC9','whatsapp','+16463846833','high');

-- the nine contactless rows, exactly as they are in production
insert into public.members (id, circle_id, owner_id, name, avatar, avatar_color,
       trust_basis, contact_method, contact_value, response_rate, person_id, created_at) values
 ('10ec69d9-8318-4b1b-a146-376920efce47','05839ac0-26ae-4061-be3f-bbd01b74c527','c7af8222-f595-455b-83d4-d848a8bd621a','shapiro',null,'#217A4B',null,'app',null,'unknown','4d9b5e97-c416-47cc-b979-de93af52350e','2026-08-11 12:32+00'),
 ('39bf1028-071b-4f99-b949-303ae9013cfb','437e6c70-4a0f-470b-b616-d3789d43052c','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','Dan Shapiro',null,'#217A4B',null,'app',null,'unknown','0c2d2051-779b-4a8e-8de0-9770a5f8d48d','2026-08-20 01:59+00'),
 ('4e67814d-230f-4423-992c-7333fdae15ca','06fd4bcb-495a-4317-8913-4b677ca2b0f1','acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','dan test1',null,'#217A4B',null,'app',null,'unknown','8221e61a-546a-43d3-b0a5-f230e435989b','2026-08-11 12:07+00'),
 ('4e6c5536-ae5e-4ae5-a127-ef8b4f906a1f','a763ae16-053c-493a-b9d2-cd77f5c684fc','e3ba6e76-494e-449c-a56f-1b42b43bdf7d','dshapiro3012@gmail.com',null,'#217A4B',null,'app',null,'unknown','69011a23-4f60-4784-ae82-210b22a97b0f','2026-08-11 20:06+00'),
 ('685b9609-53d5-42d2-bef4-1d2921b9a0d9','46fb2225-9561-4559-9e9c-019fa9504a27','016af977-9239-40db-81b0-13761f68ed0c','Dany',null,'#217A4B',null,'app',null,'unknown','db85d42d-900f-40ba-95ca-b8f945d7546a','2026-08-11 12:27+00'),
 ('a164dac3-e4a2-43f5-a1bb-06ef0a8426eb','46fb2225-9561-4559-9e9c-019fa9504a27','016af977-9239-40db-81b0-13761f68ed0c','dan test2',null,'#217A4B',null,'app',null,'unknown','5d3e52b5-3538-4bcb-bf19-351fa8ed8c17','2026-08-11 12:27+00'),
 ('c777a443-de19-4514-b84e-db1562e9e2e7','06fd4bcb-495a-4317-8913-4b677ca2b0f1','acd2d9cb-07bb-4a6b-a5a4-85297f6ed2ee','daj',null,'#217A4B',null,'app',null,'unknown','27b4f8b9-413c-4354-a4fa-4e26f56747f1','2026-08-11 13:47+00'),
 ('f21294c7-5f90-4748-963f-afc9225ef13d','af345516-ccfb-41b9-90cf-9acc5bfff2f9','c7af8222-f595-455b-83d4-d848a8bd621a','Itamar',null,'#217A4B',null,'app',null,'unknown','39010857-b5f2-4106-9e5d-0c79a050da99','2026-08-11 05:59+00'),
 ('fd11e917-6c42-4bac-85d1-84f5eafd2b6c','c1b5e01c-33e5-402a-8be3-b77ce5e7ca6f','016af977-9239-40db-81b0-13761f68ed0c','Dany',null,'#217A4B',null,'app',null,'unknown','db85d42d-900f-40ba-95ca-b8f945d7546a','2026-08-10 16:06+00');

-- 3 answers on the SURVIVOR, plus a recommendation and an invite on the LOSER
-- (production has answers only; these prove the repair re-points all three FKs)
insert into public.query_responses (member_id, body) values
 ('a11092a6-8e90-4d21-a3fd-0e9438b336b2','answer one'),
 ('a11092a6-8e90-4d21-a3fd-0e9438b336b2','answer two'),
 ('a11092a6-8e90-4d21-a3fd-0e9438b336b2','answer three');
insert into public.recommendations (recommended_by_member_id, name) values
 ('4adb6127-6f27-42cb-b8cc-3b1afae1c26f','a rec credited to the loser');
insert into public.invites (member_id, invite_token) values
 ('4adb6127-6f27-42cb-b8cc-3b1afae1c26f','tok-loser');
