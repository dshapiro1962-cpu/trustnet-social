-- ═══════════════════════════════════════════════════════════════════════════
-- writers.sql — the save paths AS THEY ACTUALLY BEHAVE, replayed.
--
-- Not the fixture's four hardcoded canonicals: each function below performs the
-- same sequence of statements the real writer performs, so a candidate design
-- is judged on what the writers do, not on what a static fixture asserts.
--
--   w1  receive-response      match_canonical(name, location, phone) + kind
--   w2  extract-chat-recs     match_canonical(name, location, null), no kind
--   w3  whatsapp-webhook      blind insert ... returning id, then the rec
--   w4  client handleSaveRec  findExistingCanonical missed -> blind, then rec
--   w5  A FUTURE WRITER       written by someone who never read the design
--   w6  handleConfirmSaveToLibrary shape: the rec is written BEFORE the canonical
--
-- Every one logs an outcome instead of aborting, so a candidate that breaks a
-- writer is visible as a failed writer rather than a failed script.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists replay_log (
  seq serial primary key, writer text, ok boolean, detail text);

create or replace function log_try(p_writer text, p_ok boolean, p_detail text)
returns void language sql as $$ insert into replay_log(writer, ok, detail)
  values (p_writer, p_ok, p_detail); $$;

-- Y is the contributor; his own circle is 'Bella Vita'.
create or replace function w_y() returns uuid language sql immutable as
  $$ select 'bbbbbbbb-0000-4000-8000-000000000002'::uuid $$;
create or replace function w_ycircle() returns uuid language sql immutable as
  $$ select 'c2222222-0000-4000-8000-000000000002'::uuid $$;

-- ── w1 · receive-response ─────────────────────────────────────────────────
create or replace function w1() returns void language plpgsql as $$
declare v_id uuid;
begin
  v_id := match_canonical('La Leggenda dei Frati', 'Firenze', '+39055068550');
  if v_id is null then
    insert into canonicals (type, name, location, phone, kind, created_by)
    values ('place', 'La Leggenda dei Frati', 'Firenze', '+39055068550',
            'restaurant', w_y())
    returning id into v_id;
  end if;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'answered a query', w_ycircle());
  perform log_try('w1 receive-response', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w1 receive-response', false, sqlerrm);
end $$;

-- ── w2 · extract-chat-recs ────────────────────────────────────────────────
create or replace function w2() returns void language plpgsql as $$
declare v_id uuid;
begin
  v_id := match_canonical('La Leggenda dei Frati', 'Firenze', null);
  if v_id is null then
    insert into canonicals (type, name, location, created_by)
    values ('place', 'La Leggenda dei Frati', 'Firenze', w_y())
    returning id into v_id;
  end if;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'from a whatsapp chat export', w_ycircle());
  perform log_try('w2 extract-chat-recs', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w2 extract-chat-recs', false, sqlerrm);
end $$;

-- ── w3 · whatsapp-webhook · resolves nothing ──────────────────────────────
create or replace function w3() returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into canonicals (type, name, location, created_by)
  values ('place', 'la leggenda dei frati', 'Firenze', w_y())
  returning id into v_id;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'saved via the whatsapp bot', w_ycircle());
  perform log_try('w3 whatsapp-webhook', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w3 whatsapp-webhook', false, sqlerrm);
end $$;

-- ── w4 · client handleSaveRec · findExistingCanonical is JS, in memory ────
create or replace function w4() returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into canonicals (type, name, location, created_by)
  values ('place', 'Leggenda dei Frati', 'Firenze', w_y())
  returning id into v_id;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'typed into Add to Library', w_ycircle());
  perform log_try('w4 client handleSaveRec', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w4 client handleSaveRec', false, sqlerrm);
end $$;

-- ── w5 · THE FORGETTING TEST ──────────────────────────────────────────────
-- A writer added six months from now by someone who never read this design.
-- It does the obvious thing: insert the canonical, insert the rec.
create or replace function w5() returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into canonicals (type, name, location, created_by)
  values ('place', 'La Leggenda Dei Frati', 'Firenze', w_y())
  returning id into v_id;
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'a writer nobody told', w_ycircle());
  perform log_try('w5 FUTURE writer', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w5 FUTURE writer', false, sqlerrm);
end $$;

-- ── w6 · the FK-ordering shape ────────────────────────────────────────────
-- handleConfirmSaveToLibrary calls saveRecs() at 7263 before saveCanonicals()
-- at 7289: the client mints the uuid and writes the rec first.
create or replace function w6() returns void language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into recommendations (canonical_id, owner_id, note, circle_id)
  values (v_id, w_y(), 'rec written before its canonical', w_ycircle());
  insert into canonicals (id, type, name, location, created_by)
  values (v_id, 'place', 'La Leggenda dei Frati', 'Firenze', w_y());
  perform log_try('w6 rec-before-canonical', true, 'canonical ' || left(v_id::text, 8));
exception when others then perform log_try('w6 rec-before-canonical', false, sqlerrm);
end $$;
