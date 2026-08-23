-- ═══ CANDIDATE E · D, but a name guess is a QUESTION, not a fold ═══════════
-- Phone match  -> fold silently, on write. "A matching phone is proof."
-- Name match   -> the row stays LIVE, and a pending review is recorded.
--                 Nothing merges until a human says so.
alter table canonicals add column if not exists merged_into uuid
  references canonicals(id) on delete set null;
create index if not exists canonicals_merged_into_idx
  on canonicals (merged_into) where merged_into is not null;

create table if not exists canonical_fold_queue (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references canonicals(id) on delete cascade,
  head_id      uuid not null references canonicals(id) on delete cascade,
  score numeric not null,
  status text not null default 'pending' check (status in ('pending','folded','kept_apart')),
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, head_id));

create or replace function canonical_head(p_id uuid) returns uuid language plpgsql stable as $fn$
declare v_id uuid := p_id; v_next uuid; i int := 0;
begin
  loop
    select merged_into into v_next from canonicals where id = v_id;
    exit when v_next is null or i >= 8;
    v_id := v_next; i := i + 1;
  end loop;
  return v_id;
end $fn$;

-- phone proof only
create or replace function match_canonical_phone(p_phone text) returns uuid language sql stable as $fn$
  select id from public.canonicals
   where merged_into is null and phone_key is not null
     and phone_key = phone_key(p_phone) and length(phone_key(p_phone)) >= 9
   limit 1; $fn$;

-- name guess, with its score
create or replace function match_canonical_name(p_name text, p_location text,
  out m_id uuid, out m_score numeric) language sql stable as $fn$
  select id, similarity(lower(name), lower(p_name))::numeric from public.canonicals
   where merged_into is null
     and similarity(lower(name), lower(p_name)) > 0.45
     and (p_location is null or location is null
          or lower(location) = lower(p_location)
          or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
   order by similarity(lower(name), lower(p_name)) desc limit 1; $fn$;

create or replace function canonicals_identity() returns trigger language plpgsql as $fn$
declare v uuid; n record;
begin
  if new.merged_into is not null then return new; end if;
  v := match_canonical_phone(new.phone);
  if v is not null and v <> new.id then
    new.merged_into := canonical_head(v);          -- proof: fold, silently
    return new;
  end if;
  select * into n from match_canonical_name(new.name, new.location);
  if n.m_id is not null and n.m_id <> new.id then
    new.pending_head := canonical_head(n.m_id);    -- guess: ask, later
    new.pending_score := n.m_score;
  end if;
  return new;
end $fn$;

alter table canonicals add column if not exists pending_head uuid;
alter table canonicals add column if not exists pending_score numeric;

create or replace function canonicals_enqueue() returns trigger language plpgsql as $fn$
begin
  if new.pending_head is not null then
    insert into canonical_fold_queue (candidate_id, head_id, score)
    values (new.id, new.pending_head, new.pending_score)
    on conflict (candidate_id, head_id) do nothing;
  end if;
  return null;
end $fn$;

drop trigger if exists canonicals_identity_trg on canonicals;
create trigger canonicals_identity_trg before insert on canonicals
  for each row execute function canonicals_identity();
drop trigger if exists canonicals_enqueue_trg on canonicals;
create trigger canonicals_enqueue_trg after insert on canonicals
  for each row execute function canonicals_enqueue();

create or replace function recs_point_at_head() returns trigger language plpgsql as $fn$
begin new.canonical_id := canonical_head(new.canonical_id); return new; end $fn$;
drop trigger if exists recs_head_trg on recommendations;
create trigger recs_head_trg before insert or update of canonical_id on recommendations
  for each row execute function recs_point_at_head();

-- the decision, when a human makes it
create or replace function resolve_fold(p_queue_id uuid, p_fold boolean, p_by uuid default null)
returns void language plpgsql as $fn$
declare q record;
begin
  select * into q from canonical_fold_queue where id = p_queue_id and status = 'pending';
  if not found then return; end if;
  if p_fold then
    update recommendations set canonical_id = canonical_head(q.head_id)
     where canonical_id = q.candidate_id;
    update canonicals set merged_into = canonical_head(q.head_id) where id = q.candidate_id;
    update canonical_fold_queue set status='folded', decided_by=p_by, decided_at=now() where id=q.id;
  else
    update canonical_fold_queue set status='kept_apart', decided_by=p_by, decided_at=now() where id=q.id;
  end if;
end $fn$;
