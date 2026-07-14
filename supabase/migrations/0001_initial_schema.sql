-- ============================================================================
-- TRUSTNET — INITIAL SCHEMA
-- Run once in the Supabase SQL Editor, or via `supabase db push`.
-- Idempotent where practical. Safe to read top to bottom.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- fuzzy text match for canonical dedup

-- ---------------------------------------------------------------------------
-- Updated-at trigger function (shared by all tables)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- TABLE: users  (profile data; extends auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null check (char_length(name) <= 80),
  avatar              text,
  avatar_color        text default '#217A4B',
  bio                 text check (char_length(bio) <= 300),
  location            text,
  email               text,
  phone               text,            -- E.164 international format
  taste_match_enabled boolean not null default true,
  degree2_enabled     boolean not null default true,
  joined_date         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_users_updated before update on public.users
  for each row execute function set_updated_at();

create index if not exists idx_users_email on public.users (lower(email));
create index if not exists idx_users_phone on public.users (phone);

-- ---------------------------------------------------------------------------
-- TABLE: circles
-- ---------------------------------------------------------------------------
create table if not exists public.circles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id) on delete cascade,
  name        text not null check (char_length(name) <= 60),
  domain      text not null check (domain in
                ('dining','travel','healthcare','home','culture',
                 'hobbies','professional','other')),
  description text check (char_length(description) <= 300),
  color       text default '#217A4B',
  location    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_circles_updated before update on public.circles
  for each row execute function set_updated_at();

create index if not exists idx_circles_owner on public.circles (owner_id);
create index if not exists idx_circles_domain on public.circles (domain);

-- ---------------------------------------------------------------------------
-- TABLE: members
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id                 uuid primary key default gen_random_uuid(),
  circle_id          uuid not null references public.circles(id) on delete cascade,
  owner_id           uuid not null references public.users(id) on delete cascade,
  name               text not null,
  avatar             text,
  avatar_color       text default '#217A4B',
  trust_basis        text check (char_length(trust_basis) <= 400),
  contact_method     text check (contact_method in ('app','whatsapp','email','linkedin','source')),
  contact_value      text,   -- phone (E.164), email, or url
  response_rate      text check (response_rate in ('high','medium','low','unknown')) default 'unknown',
  is_external_source boolean not null default false,
  source_type        text check (source_type in ('critic','publication','newsletter','expert')),
  source_url         text,
  linked_user_id     uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_members_updated before update on public.members
  for each row execute function set_updated_at();

create index if not exists idx_members_circle on public.members (circle_id);
create index if not exists idx_members_owner on public.members (owner_id);
create index if not exists idx_members_linked on public.members (linked_user_id);
create index if not exists idx_members_contact on public.members (lower(contact_value));

-- ---------------------------------------------------------------------------
-- TABLE: canonicals  (global; the thing being recommended)
-- ---------------------------------------------------------------------------
create table if not exists public.canonicals (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('place','person','product','service','content')),
  name        text not null,
  category    text,
  location    text,
  description text,
  image_emoji text default '📌',
  google_url  text,
  website_url text,
  linkedin_url text,
  created_by  uuid references public.users(id) on delete set null,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_canonicals_updated before update on public.canonicals
  for each row execute function set_updated_at();

create index if not exists idx_canonicals_name_trgm
  on public.canonicals using gin (lower(name) gin_trgm_ops);
create index if not exists idx_canonicals_location on public.canonicals (lower(location));

-- ---------------------------------------------------------------------------
-- TABLE: recommendations
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
  id                       uuid primary key default gen_random_uuid(),
  canonical_id             uuid not null references public.canonicals(id) on delete cascade,
  circle_id                uuid references public.circles(id) on delete set null,
  owner_id                 uuid not null references public.users(id) on delete cascade,
  recommended_by_member_id uuid references public.members(id) on delete set null,
  recommended_by_user_id   uuid references public.users(id) on delete set null,
  query_id                 uuid,  -- FK added after queries table created
  note                     text check (char_length(note) <= 1000),
  rating                   smallint check (rating between 1 and 5),
  tags                     text[] default '{}',
  status                   text check (status in ('available','visited','saved','dismissed')) default 'saved',
  is_anonymous             boolean not null default false,
  degree                   smallint not null default 1 check (degree in (1,2)),
  rec_date                 date not null default current_date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger trg_recs_updated before update on public.recommendations
  for each row execute function set_updated_at();

create index if not exists idx_recs_owner on public.recommendations (owner_id);
create index if not exists idx_recs_canonical on public.recommendations (canonical_id);
create index if not exists idx_recs_circle on public.recommendations (circle_id);

-- ---------------------------------------------------------------------------
-- TABLE: queries
-- ---------------------------------------------------------------------------
create table if not exists public.queries (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id) on delete cascade,
  sent_by      uuid not null references public.users(id) on delete cascade,
  text         text not null check (char_length(text) <= 500),
  text_hash    text,                 -- sha256 of normalised text (dedup)
  degree       smallint not null default 1 check (degree in (1,2)),
  status       text check (status in ('draft','sent','completed')) default 'draft',
  sent_at      timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_queries_updated before update on public.queries
  for each row execute function set_updated_at();

create index if not exists idx_queries_sentby on public.queries (sent_by);
create index if not exists idx_queries_circle on public.queries (circle_id);
create index if not exists idx_queries_hash on public.queries (text_hash);

-- now wire the deferred FK from recommendations -> queries
alter table public.recommendations
  drop constraint if exists recommendations_query_id_fkey,
  add constraint recommendations_query_id_fkey
    foreign key (query_id) references public.queries(id) on delete set null;

-- ---------------------------------------------------------------------------
-- TABLE: query_responses
-- ---------------------------------------------------------------------------
create table if not exists public.query_responses (
  id              uuid primary key default gen_random_uuid(),
  query_id        uuid not null references public.queries(id) on delete cascade,
  member_id       uuid references public.members(id) on delete set null,
  canonical_id    uuid references public.canonicals(id) on delete set null,
  rec_name        text,
  rec_note        text,
  rec_location    text,
  rec_emoji       text,
  degree          smallint not null default 1 check (degree in (1,2)),
  is_anonymous    boolean not null default false,
  saved_to_library boolean not null default false,
  response_token  text unique not null,
  token_expires_at timestamptz not null default (now() + interval '72 hours'),
  token_used      boolean not null default false,
  send_status     text check (send_status in ('pending','sent','failed','responded')) default 'pending',
  send_error      text,
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_qr_updated before update on public.query_responses
  for each row execute function set_updated_at();

create index if not exists idx_qr_query on public.query_responses (query_id);
create index if not exists idx_qr_token on public.query_responses (response_token);
create index if not exists idx_qr_member on public.query_responses (member_id);

-- ---------------------------------------------------------------------------
-- TABLE: notifications  (in-app inbox; the "app" contact channel)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null check (type in
                ('query','query_response','reciprocal','invite_accepted','taste_match')),
  title       text not null,
  body        text,
  query_id    uuid references public.queries(id) on delete cascade,
  response_token text,
  circle_id   uuid references public.circles(id) on delete cascade,
  actor_name  text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- TABLE: invites  (non-user contacts invited via response form / explicit invite)
-- ---------------------------------------------------------------------------
create table if not exists public.invites (
  id            uuid primary key default gen_random_uuid(),
  inviter_id    uuid not null references public.users(id) on delete cascade,
  member_id     uuid references public.members(id) on delete set null,
  channel       text check (channel in ('whatsapp','email')),
  contact_value text not null,
  invite_token  text unique not null,
  accepted      boolean not null default false,
  accepted_user_id uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_invites_token on public.invites (invite_token);
create index if not exists idx_invites_contact on public.invites (lower(contact_value));

-- ---------------------------------------------------------------------------
-- TABLE: taste_match_profiles  (anonymised; recalculated nightly)
-- ---------------------------------------------------------------------------
create table if not exists public.taste_match_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.users(id) on delete cascade,
  category_vector  jsonb not null default '{}',
  tag_fingerprint  text[] not null default '{}',
  location_primary text,
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TABLE: taste_matches  (precomputed top matches per user; anonymised at API layer)
-- ---------------------------------------------------------------------------
create table if not exists public.taste_matches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  matched_user_id uuid not null references public.users(id) on delete cascade,
  score         numeric not null,
  created_at    timestamptz not null default now(),
  unique (user_id, matched_user_id)
);
create index if not exists idx_taste_matches_user on public.taste_matches (user_id, score desc);

-- ============================================================================
-- HELPER RPCs
-- ============================================================================

-- Fuzzy canonical match: returns best existing canonical for a name+location,
-- or null. Threshold 0.45 on trigram similarity. Used by receive-response.
create or replace function match_canonical(p_name text, p_location text)
returns uuid language plpgsql stable as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.canonicals
  where similarity(lower(name), lower(p_name)) > 0.45
    and (p_location is null
         or location is null
         or lower(location) = lower(p_location)
         or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
  order by similarity(lower(name), lower(p_name)) desc
  limit 1;
  return v_id;
end;
$$;

-- On user signup/profile-create: link this user to any existing member rows
-- that reference their email or phone. Powers reciprocal detection.
-- Also fires a 'reciprocal' notification to circle owners.
create or replace function link_member_on_signup(p_user_id uuid, p_email text, p_phone text)
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select m.id as member_id, m.owner_id, m.circle_id, c.name as circle_name, u.name as owner_name
    from public.members m
    join public.circles c on c.id = m.circle_id
    join public.users u on u.id = m.owner_id
    where m.linked_user_id is null
      and (
        (p_email is not null and lower(m.contact_value) = lower(p_email)) or
        (p_phone is not null and m.contact_value = p_phone)
      )
  loop
    update public.members set linked_user_id = p_user_id where id = r.member_id;

    insert into public.notifications (user_id, type, title, body, circle_id, actor_name)
    values (
      p_user_id, 'reciprocal',
      r.owner_name || ' has you in their ' || r.circle_name || ' circle',
      'You may receive occasional recommendation requests from ' || r.owner_name || '.',
      r.circle_id, r.owner_name
    );
  end loop;
end;
$$;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
alter table public.users               enable row level security;
alter table public.circles             enable row level security;
alter table public.members             enable row level security;
alter table public.canonicals          enable row level security;
alter table public.recommendations     enable row level security;
alter table public.queries             enable row level security;
alter table public.query_responses     enable row level security;
alter table public.notifications       enable row level security;
alter table public.invites             enable row level security;
alter table public.taste_match_profiles enable row level security;
alter table public.taste_matches       enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists circles_owner on public.circles;
create policy circles_owner on public.circles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists members_owner on public.members;
create policy members_owner on public.members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists canonicals_read on public.canonicals;
create policy canonicals_read on public.canonicals
  for select using (auth.role() = 'authenticated');
drop policy if exists canonicals_insert on public.canonicals;
create policy canonicals_insert on public.canonicals
  for insert with check (auth.role() = 'authenticated');
drop policy if exists canonicals_update_creator on public.canonicals;
create policy canonicals_update_creator on public.canonicals
  for update using (created_by = auth.uid());

drop policy if exists recs_owner on public.recommendations;
create policy recs_owner on public.recommendations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists queries_owner on public.queries;
create policy queries_owner on public.queries
  for all using (sent_by = auth.uid()) with check (sent_by = auth.uid());

drop policy if exists qr_read_by_query_owner on public.query_responses;
create policy qr_read_by_query_owner on public.query_responses
  for select using (
    exists (select 1 from public.queries q
            where q.id = query_responses.query_id and q.sent_by = auth.uid())
  );

drop policy if exists notif_owner on public.notifications;
create policy notif_owner on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists invites_owner on public.invites;
create policy invites_owner on public.invites
  for all using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());

drop policy if exists tmp_owner_read on public.taste_match_profiles;
create policy tmp_owner_read on public.taste_match_profiles
  for select using (user_id = auth.uid());

drop policy if exists tm_owner_read on public.taste_matches;
create policy tm_owner_read on public.taste_matches
  for select using (user_id = auth.uid());

-- ============================================================================
-- NOTE ON SERVICE ROLE
-- Edge Functions that need to write query_responses, notifications for *other*
-- users, taste_match_profiles, or taste_matches use the SERVICE ROLE key,
-- which bypasses RLS. Never expose that key to the browser.
-- ============================================================================
