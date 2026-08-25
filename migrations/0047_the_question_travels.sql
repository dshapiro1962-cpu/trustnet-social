-- ============================================================================
-- 0047 · THE QUESTION TRAVELS WITH THE ANSWER
--
-- dan, 25 Aug: "the connection between the question and answer are lost".
--
-- MEASURED FIRST. It is not lost - it is unreachable. 57 canonicals already
-- carry the question inside `search_doc` as "asked: ...", because
-- buildSearchDoc puts it there for retrieval. So the text exists; nothing can
-- get at it.
--
-- WHY NOT JUST READ IT FROM THERE. Two reasons. search_doc is a blob built for
-- embedding, joined with " · " - parsing it back out is building on a format
-- that exists to be fed to a model, not read. And more importantly canonicals
-- are SHARED: two people can ask different questions about the same restaurant,
-- and a question stored there is last-writer-wins. The same shared/personal
-- confusion that produced `matched_circles` meaning two things, and that 0045
-- was written to end.
--
-- WHY NOT query_id. `recommendations.query_id` already exists on 23 rows, and
-- the client cannot use it: `queries` is protected by
-- `queries_owner ... using (sent_by = auth.uid())`, so a recipient can never
-- read the question someone else asked. An id you cannot resolve is not
-- provenance. The TEXT has to travel.
--
-- So: one text column on each PER-MEMBER row that an item can arrive through.
-- Both are already per-member; neither is shared.
--
--   suggestions.query_text       what the sender was answering, when it reached
--                                you as a suggestion or a direct send
--   recommendations.source_question
--                                the same, kept when you accept it into your
--                                library, so the provenance survives the move
--
-- The Supabase SQL editor sends EACH STATEMENT ON ITS OWN CONNECTION. Numbered,
-- idempotent, run one at a time. No begin/commit.
-- ============================================================================

-- 1 · the question, as it reaches you
alter table public.suggestions
  add column if not exists query_text text;

-- 2 · the question, once it is yours
alter table public.recommendations
  add column if not exists source_question text;

-- 3 · Backfill what can be recovered. A recommendation whose query the owner
--     DOES own can be filled in directly - no parsing, no guessing. Items that
--     arrived from someone else cannot be recovered and are left null; they
--     will carry their question from the next send onward.
update public.recommendations r
   set source_question = q.text
  from public.queries q
 where q.id = r.query_id
   and r.source_question is null
   and coalesce(q.text, '') <> '';

-- 4 · The direct-send RPC learns to carry it. Replaced whole rather than
--     patched: `create or replace function` is atomic, so there is no moment
--     where the function is missing.
create or replace function public.send_rec_to_member(p_rec_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me        uuid := auth.uid();
  v_rec       record;
  v_member    record;
  v_existing  uuid;
  v_person    uuid;
  v_circles   uuid[];
  v_question  text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;

  select * into v_rec from public.recommendations where id = p_rec_id and owner_id = v_me;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_item'); end if;

  select * into v_member from public.members
   where id = p_member_id and owner_id = v_me and linked_user_id is not null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_member_or_not_on_app'); end if;

  if v_member.linked_user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'cannot_send_to_yourself');
  end if;

  if exists (select 1 from public.recommendations
             where owner_id = v_member.linked_user_id and canonical_id = v_rec.canonical_id) then
    return jsonb_build_object('ok', false, 'error', 'already_in_their_library');
  end if;

  select id into v_existing from public.suggestions
   where user_id = v_member.linked_user_id and canonical_id = v_rec.canonical_id;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end if;

  -- ── WHO AM I, TO THEM? ────────────────────────────────────────────────────
  -- The card names the sender via from_person_id — a person in the RECIPIENT'S
  -- address book. Writing only from_user_id (my auth id) told the card nothing
  -- it could display, which is why it fell back to "Someone in your circles".
  select m2.person_id into v_person
  from public.members m2
  where m2.owner_id = v_member.linked_user_id
    and m2.linked_user_id = v_me
    and m2.person_id is not null
  limit 1;

  -- ── WHICH CIRCLES DO WE SHARE? ────────────────────────────────────────────
  -- Recorded so that ACCEPTING files the item somewhere. '{}' meant the item
  -- landed with no circle — the contextless state that made items unfindable.
  select coalesce(array_agg(distinct m3.circle_id), '{}'::uuid[]) into v_circles
  from public.members m3
  where m3.owner_id = v_member.linked_user_id
    and m3.linked_user_id = v_me;

  -- THE RECIPIENT MAY NOT HAVE ME IN ANY CIRCLE. Found live: dan sent
  -- La Plagne to Dany, who had never added dan back, so there was no person
  -- record to name and the card said "This arrived without a sender". Correct
  -- refusal, wrong outcome: I CHOSE to send it, so my name should travel with
  -- it. A recommendation whose sender cannot be named is worth little.
  -- from_name is the sender's own profile name, used only when the recipient
  -- has no person record of their own to show.
  -- THE QUESTION TRAVELS (0047). Preferring what is already on the row means a
  -- forwarded item keeps the question it was originally answering rather than
  -- losing it at every hop; the queries lookup is the fallback for items that
  -- predate source_question.
  v_question := nullif(coalesce(v_rec.source_question, ''), '');
  if v_question is null and v_rec.query_id is not null then
    select q.text into v_question from public.queries q where q.id = v_rec.query_id;
  end if;

  insert into public.suggestions
    (user_id, canonical_id, from_person_id, from_user_id, from_name, via, source_note,
     matched_circles, matched_interest, query_text)
  values
    (v_member.linked_user_id, v_rec.canonical_id, v_person, v_me,
     (select name from public.users where id = v_me), 'direct',
     left(coalesce(v_rec.note, ''), 300), v_circles,
     -- NOT an empty string. The card composes a sentence around this value and
     -- '' produced "It matches ." with a dangling stop. A direct send has a
     -- true thing to say: someone chose to send it to you.
     'sent to you directly', left(coalesce(v_question, ''), 300));

  -- NO SEPARATE NOTIFICATION. It produced a SECOND Inbox entry — a bare line
  -- with no detail, no link and no accept button — duplicating the card with
  -- strictly less information. The suggestion IS the notification.

  return jsonb_build_object('ok', true, 'named_sender', v_person is not null,
                            'shared_circles', coalesce(array_length(v_circles, 1), 0));
end;
$$;

-- 5 · unchanged from 0031, restated because the function was replaced
revoke all on function public.send_rec_to_member(uuid, uuid) from public;

-- 6 · ...
grant execute on function public.send_rec_to_member(uuid, uuid) to authenticated;

-- 7 · Verify. `recovered` is how many library items just got their question
--     back; `still_unknown` are ones that arrived from someone else before this
--     migration and cannot be recovered.
select count(*) filter (where source_question is not null)::int as recovered,
       count(*) filter (where source_question is null
                          and query_id is not null)::int        as still_unknown,
       count(*)::int                                            as recs_total
from public.recommendations;
