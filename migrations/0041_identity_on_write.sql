-- ═══════════════════════════════════════════════════════════════════════════
-- 0041 · IDENTITY ON WRITE
--
-- Three tiers. Normalised-exact folds silently, a matching phone folds
-- silently, everything else above 0.45 becomes a question and folds nothing.
-- Every fold and every redirect is logged, so every one of them is reversible.
--
-- RUN THESE ONE AT A TIME IN THE SUPABASE SQL EDITOR.
-- The editor sends each statement on its own connection. There is no shared
-- transaction here and no `begin`. Every statement below is idempotent and
-- independently verifiable: if you stop halfway, what ran is complete and what
-- did not run has not half-applied.
--
-- Verified with simulation_suite/sql-editor-runner.sh.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · normalisation. The whole definition of the silent tier. ──────────
-- lowercase, every run of non-alphanumerics to one space, trim.
-- "Tony vespa" = "Tony Vespa".  "שושן שמוליק" = "שושן-שמוליק".
-- "Art Pizza" <> "Artzieli Pizza".
create or replace function public.norm_name(p_text text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(lower(btrim(p_text)), '[^[:alnum:]]+', ' ', 'g')), '');
$$;

-- ─── 2 · the fold pointer ─────────────────────────────────────────────────
alter table public.canonicals
  add column if not exists merged_into uuid references public.canonicals(id) on delete cascade;

-- ─── 3 · index: live rows only ────────────────────────────────────────────
create index if not exists canonicals_merged_into_idx
  on public.canonicals (merged_into) where merged_into is not null;

-- ─── 4 · index: the tier 1 lookup ─────────────────────────────────────────
create index if not exists canonicals_norm_name_idx
  on public.canonicals (public.norm_name(name)) where merged_into is null;

-- ─── 5 · the log. No foreign keys: history must outlive the rows. ─────────
create table if not exists public.canonical_resolution_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  at timestamptz not null default now(),
  tier text not null check (tier in ('norm_exact','phone','answered','backfill','redirect','unmerge')),
  canonical_id uuid,
  head_id uuid,
  rec_id uuid,
  prev_canonical_id uuid,
  new_canonical_id uuid,
  decided_by uuid,
  detail text
);

-- ─── 6 · index on the log, for unmerge ────────────────────────────────────
create index if not exists canonical_resolution_log_event_idx
  on public.canonical_resolution_log (event_id);

-- ─── 7 · the queue. A tier 3 match is a question, not a fold. ─────────────
create table if not exists public.canonical_fold_queue (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.canonicals(id) on delete cascade,
  head_id uuid not null references public.canonicals(id) on delete cascade,
  candidate_norm text not null,
  head_norm text not null,
  score numeric not null,
  status text not null default 'pending' check (status in ('pending','folded','kept_apart')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, head_id)
);

-- ─── 8 · a decision is about THINGS, not rows. Remember it by name. ───────
create unique index if not exists canonical_fold_kept_apart_idx
  on public.canonical_fold_queue (least(candidate_norm, head_norm), greatest(candidate_norm, head_norm))
  where status = 'kept_apart';

-- ─── 9 · follow the pointer to the live row. Capped: a cycle cannot hang. ─
create or replace function public.canonical_head(p_id uuid)
returns uuid language plpgsql stable as $$
declare v_id uuid := p_id; v_next uuid; i int := 0;
begin
  if p_id is null then return null; end if;
  loop
    select merged_into into v_next from public.canonicals where id = v_id;
    exit when v_next is null or i >= 8;
    v_id := v_next; i := i + 1;
  end loop;
  return v_id;
end $$;

-- ─── 10 · TIER 1 and TIER 2, on write. The row is always inserted. ────────
-- It is marked, never skipped and never deleted, so `insert ... returning id`
-- stays valid and the foreign key the writer is about to use holds.
create or replace function public.canonicals_identity_fold()
returns trigger language plpgsql as $$
declare v_head uuid; v_key text; v_event uuid;
begin
  if new.merged_into is not null then return new; end if;

  -- tier 1: the same string written twice
  select id into v_head from public.canonicals
   where merged_into is null and id <> new.id
     and public.norm_name(name) = public.norm_name(new.name)
   order by created_at asc limit 1;
  if v_head is not null then
    v_event := gen_random_uuid();
    new.merged_into := public.canonical_head(v_head);
    insert into public.canonical_resolution_log (event_id, tier, canonical_id, head_id, detail)
    values (v_event, 'norm_exact', new.id, new.merged_into, public.norm_name(new.name));
    return new;
  end if;

  -- tier 2: a matching phone is proof
  v_key := public.phone_key(new.phone);
  if v_key is not null and length(v_key) >= 9 then
    select id into v_head from public.canonicals
     where merged_into is null and id <> new.id and phone_key = v_key
     order by created_at asc limit 1;
    if v_head is not null then
      v_event := gen_random_uuid();
      new.merged_into := public.canonical_head(v_head);
      insert into public.canonical_resolution_log (event_id, tier, canonical_id, head_id, detail)
      values (v_event, 'phone', new.id, new.merged_into, v_key);
      return new;
    end if;
  end if;

  return new;
end $$;

-- ─── 11 · arm tier 1 and 2 ────────────────────────────────────────────────
-- ONE statement, not a drop followed by a create. Stop between a drop and a
-- create in the editor and the trigger is left disarmed, which is exactly the
-- half-applied state 0036 produced.
create or replace trigger canonicals_identity_fold_trg
  before insert on public.canonicals
  for each row execute function public.canonicals_identity_fold();

-- ─── 12 · TIER 3. Every match above threshold, not the best one. ──────────
-- After insert, because the queue's foreign key needs the row to exist.
-- Only runs when tiers 1 and 2 declined, so it costs nothing on a fold.
create or replace function public.canonicals_identity_enqueue()
returns trigger language plpgsql as $$
declare r record; v_norm text;
begin
  if new.merged_into is not null then return null; end if;
  v_norm := public.norm_name(new.name);

  for r in
    select c.id, public.norm_name(c.name) as n,
           similarity(lower(c.name), lower(new.name))::numeric as s
      from public.canonicals c
     where c.merged_into is null
       and c.id <> new.id
       and public.norm_name(c.name) <> v_norm
       and similarity(lower(c.name), lower(new.name)) > 0.45
       and (new.location is null or c.location is null
            or lower(c.location) = lower(new.location)
            or similarity(lower(c.location), lower(new.location)) > 0.4)
  loop
    -- already answered "not the same thing", by name. Do not ask again.
    if exists (select 1 from public.canonical_fold_queue q
                where q.status = 'kept_apart'
                  and least(q.candidate_norm, q.head_norm) = least(v_norm, r.n)
                  and greatest(q.candidate_norm, q.head_norm) = greatest(v_norm, r.n))
    then continue; end if;

    insert into public.canonical_fold_queue
      (candidate_id, head_id, candidate_norm, head_norm, score)
    values (new.id, r.id, v_norm, r.n, round(r.s, 3))
    on conflict (candidate_id, head_id) do nothing;
  end loop;
  return null;
end $$;

-- ─── 13 · arm tier 3 ──────────────────────────────────────────────────────
create or replace trigger canonicals_identity_enqueue_trg
  after insert on public.canonicals
  for each row execute function public.canonicals_identity_enqueue();

-- ─── 14 · THE ANSWER TO THE HOLE ──────────────────────────────────────────
-- A recommendation carries only canonical_id, so this trigger does not match
-- on anything. It follows a pointer. Every writer resolves identically, and
-- no writer can forget, because no writer is asked to do anything.
create or replace function public.recs_point_at_head()
returns trigger language plpgsql as $$
declare v_head uuid;
begin
  v_head := public.canonical_head(new.canonical_id);
  if v_head is distinct from new.canonical_id then
    insert into public.canonical_resolution_log
      (event_id, tier, rec_id, prev_canonical_id, new_canonical_id)
    values (gen_random_uuid(), 'redirect', new.id, new.canonical_id, v_head);
    new.canonical_id := v_head;
  end if;
  return new;
end $$;

-- ─── 15 · arm the redirect ────────────────────────────────────────────────
create or replace trigger recs_point_at_head_trg
  before insert or update of canonical_id on public.recommendations
  for each row execute function public.recs_point_at_head();

-- ─── 16 · match_canonical must never hand back a tombstone ────────────────
-- Nothing else about it changes. Phone first, then trigram: 0020/0021 stand.
create or replace function public.match_canonical(p_name text, p_location text, p_phone text default null)
returns uuid language plpgsql stable as $$
declare v_id uuid; v_key text;
begin
  v_key := public.phone_key(p_phone);
  if v_key is not null and length(v_key) >= 9 then
    select id into v_id from public.canonicals
     where phone_key = v_key and merged_into is null limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from public.canonicals
   where merged_into is null
     and similarity(lower(name), lower(p_name)) > 0.45
     and (p_location is null or location is null
          or lower(location) = lower(p_location)
          or similarity(lower(location), lower(coalesce(p_location,''))) > 0.4)
   order by similarity(lower(name), lower(p_name)) desc limit 1;
  return v_id;
end $$;

-- ─── 17 · answering a question ────────────────────────────────────────────
create or replace function public.resolve_fold(p_queue_id uuid, p_same boolean, p_by uuid default null)
returns uuid language plpgsql as $$
declare q record; v_head uuid; v_event uuid; r record;
begin
  select * into q from public.canonical_fold_queue
   where id = p_queue_id and status = 'pending';
  if not found then return null; end if;

  if not p_same then
    update public.canonical_fold_queue
       set status = 'kept_apart', decided_by = p_by, decided_at = now()
     where id = q.id;
    return null;
  end if;

  v_event := gen_random_uuid();
  v_head  := public.canonical_head(q.head_id);

  for r in select id, canonical_id from public.recommendations
            where canonical_id = q.candidate_id loop
    insert into public.canonical_resolution_log
      (event_id, tier, rec_id, prev_canonical_id, new_canonical_id, decided_by)
    values (v_event, 'answered', r.id, r.canonical_id, v_head, p_by);
  end loop;

  update public.recommendations set canonical_id = v_head where canonical_id = q.candidate_id;
  update public.canonicals set merged_into = v_head where id = q.candidate_id;

  insert into public.canonical_resolution_log
    (event_id, tier, canonical_id, head_id, decided_by, detail)
  values (v_event, 'answered', q.candidate_id, v_head, p_by, 'score ' || q.score::text);

  update public.canonical_fold_queue
     set status = 'folded', decided_by = p_by, decided_at = now()
   where id = q.id;
  return v_event;
end $$;

-- ─── 18 · undoing one. Every merge in the system is reversible. ───────────
create or replace function public.unmerge(p_event_id uuid, p_by uuid default null)
returns int language plpgsql as $$
declare r record; n int := 0; v_canonical uuid;
begin
  -- ORDER MATTERS. The pointer is cleared FIRST. Restore the recommendations
  -- while merged_into is still set and recs_point_at_head puts every one of
  -- them straight back on the head, and the unmerge silently does nothing.
  select canonical_id into v_canonical from public.canonical_resolution_log
   where event_id = p_event_id and canonical_id is not null limit 1;
  if v_canonical is not null then
    update public.canonicals set merged_into = null where id = v_canonical;
    update public.canonical_fold_queue
       set status = 'kept_apart', decided_by = p_by, decided_at = now()
     where candidate_id = v_canonical and status = 'folded';
  end if;

  for r in select rec_id, prev_canonical_id from public.canonical_resolution_log
            where event_id = p_event_id and rec_id is not null loop
    update public.recommendations set canonical_id = r.prev_canonical_id where id = r.rec_id;
    n := n + 1;
  end loop;

  insert into public.canonical_resolution_log (event_id, tier, canonical_id, decided_by, detail)
  values (p_event_id, 'unmerge', v_canonical, p_by, n::text || ' recommendations restored');
  return n;
end $$;
