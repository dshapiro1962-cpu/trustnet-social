-- ============================================================================
-- 0017_phone_identity.sql — WhatsApp becomes a first-class identity
--
-- WHY: signup was email-only (signInWithOtp({email}), link_member_on_signup
-- called with p_phone: null). NO account had a phone recorded anywhere, so
-- "is this number a Trustnet user?" was unanswerable — and every phone-based
-- decision in the app was guesswork. Since most users will arrive through
-- WhatsApp, phone has to be a real identity, not an afterthought.
--
-- WHAT:
--   1. users.phone_key — ONE canonical form, so 050-123-4567 / +972 50 1234567 /
--      0501234567 / 972501234567 are the same person.
--   2. wa_otp — short-lived sign-in codes delivered over WhatsApp.
--   3. resolve_contacts() — the single authority for "is this contact a user,
--      and are they in this circle?", so no screen ever decides from a stale
--      cached field again.
-- ============================================================================

-- 1 ── canonical phone key ---------------------------------------------------
-- Israeli mobiles collapse to their last 9 digits; anything else keeps its
-- full digit string. Deterministic, so both sides of a match agree.
create or replace function phone_key(p_raw text)
returns text
language sql immutable as $$
  select case
    when p_raw is null or length(regexp_replace(p_raw, '\D', '', 'g')) = 0 then null
    when length(regexp_replace(p_raw, '\D', '', 'g')) >= 9
      then right(regexp_replace(p_raw, '\D', '', 'g'), 9)
    else regexp_replace(p_raw, '\D', '', 'g')
  end;
$$;

alter table users add column if not exists phone text;
alter table users add column if not exists phone_key text
  generated always as (phone_key(phone)) stored;
create unique index if not exists users_phone_key_uniq
  on users (phone_key) where phone_key is not null;

-- members get the same canonical treatment so joins are exact
alter table members add column if not exists contact_key text
  generated always as (
    case when contact_method = 'whatsapp' then phone_key(contact_value)
         when contact_method = 'email' then lower(trim(contact_value))
         else null end
  ) stored;
create index if not exists members_contact_key_idx on members (contact_key);

-- 2 ── WhatsApp sign-in codes -------------------------------------------------
create table if not exists wa_otp (
  id uuid primary key default gen_random_uuid(),
  phone_key   text not null,
  phone       text not null,
  code_hash   text not null,          -- never store the code itself
  attempts    int  not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz
);
create index if not exists wa_otp_lookup on wa_otp (phone_key, created_at desc);
alter table wa_otp enable row level security;
-- no policies: only the service role (edge functions) may touch it

-- 3 ── the resolver: the single source of truth -------------------------------
-- For each contact the caller ALREADY HOLDS, answer:
--   is_user      — does a Trustnet account exist for it
--   member_id    — is it already a member of this circle (and which row)
--   member_name  — that member's name, for an honest message
-- Returns nothing about anyone the caller doesn't already know, so it cannot be
-- used to enumerate or probe the user base.
create or replace function resolve_contacts(
  p_circle_id uuid,
  p_contacts  jsonb          -- [{"method":"whatsapp","value":"050..."} , ...]
)
returns table (
  input_value text,
  method      text,
  is_user     boolean,
  user_id     uuid,
  member_id   uuid,
  member_name text
)
language plpgsql stable security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  -- the circle must be the caller's own (or absent, for a global check)
  if p_circle_id is not null
     and not exists (select 1 from circles c where c.id = p_circle_id and c.owner_id = v_uid) then
    return;
  end if;

  return query
  with input as (
    select
      (e ->> 'value')  as raw,
      lower(coalesce(e ->> 'method', 'whatsapp')) as meth
    from jsonb_array_elements(p_contacts) e
  ), keyed as (
    select raw, meth,
      case when meth = 'whatsapp' then phone_key(raw)
           when meth = 'email'    then lower(trim(raw))
           else null end as k
    from input
  )
  select
    k.raw::text,
    k.meth::text,
    (u.id is not null) as is_user,
    u.id,
    m.id,
    m.name::text
  from keyed k
  left join users u
    on (k.meth = 'whatsapp' and u.phone_key is not null and u.phone_key = k.k)
    or (k.meth = 'email'    and lower(u.email) = k.k)
  left join members m
    on m.owner_id = v_uid
   and (p_circle_id is null or m.circle_id = p_circle_id)
   and m.contact_key = k.k;
end;
$$;

revoke all on function resolve_contacts(uuid, jsonb) from public;
grant execute on function resolve_contacts(uuid, jsonb) to authenticated;

-- 4 ── refresh a member's linkage from the CURRENT truth ----------------------
-- linked_user_id stays, but only as a cache the server reads at send time.
-- Every resolve refreshes it; no UI decision depends on it.
create or replace function refresh_member_links(p_circle_id uuid)
returns int
language plpgsql security definer
set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int := 0;
begin
  if v_uid is null then return 0; end if;
  with matched as (
    select m.id as member_id, u.id as user_id
    from members m
    join users u
      on (m.contact_method = 'whatsapp' and u.phone_key is not null and u.phone_key = m.contact_key)
      or (m.contact_method = 'email' and lower(u.email) = m.contact_key)
    where m.owner_id = v_uid
      and (p_circle_id is null or m.circle_id = p_circle_id)
      and u.id <> v_uid
      and (m.linked_user_id is distinct from u.id)
  )
  update members m set linked_user_id = matched.user_id
  from matched where m.id = matched.member_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function refresh_member_links(uuid) from public;
grant execute on function refresh_member_links(uuid) to authenticated;

-- 5 ── backfill: learn phones we already know from member records -------------
-- If a linked user was added by someone as a WhatsApp member, that number is
-- theirs; adopt it so future matching works.
update users u
set phone = sub.contact_value
from (
  select distinct on (m.linked_user_id) m.linked_user_id, m.contact_value
  from members m
  where m.linked_user_id is not null
    and m.contact_method = 'whatsapp'
    and m.contact_value is not null
  order by m.linked_user_id, m.created_at
) sub
where u.id = sub.linked_user_id and u.phone is null;

-- 6 ── verification -----------------------------------------------------------
select
  (select count(*) from information_schema.columns where table_name='users' and column_name='phone_key') as users_phone_key,
  (select count(*) from information_schema.columns where table_name='members' and column_name='contact_key') as members_contact_key,
  (select count(*) from pg_proc where proname='resolve_contacts')     as resolver,
  (select count(*) from pg_proc where proname='refresh_member_links') as refresher,
  (select count(*) from pg_tables where tablename='wa_otp')           as otp_table,
  (select count(*) from users where phone is not null)                as phones_backfilled;
