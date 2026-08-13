-- ============================================================================
-- 0031_complete_suggestions.sql                                 11 Aug 2026
--
-- THE SEAM AUDIT, FINDING C: the DIRECT send path degraded every card it
-- produced, because it set a different subset of fields from the sweep.
--
--   field             sweep                direct              card if null
--   from_person_id    m.person_id          NEVER SET           "Someone in your circles"
--   matched_circles   [circle]             '{}'                accept files it NOWHERE
--   matched_interest  ci.interest          ''                  renders "It matches ."
--
-- dan saw exactly this: "Someone in your circles sent you this. It matches ."
-- for an item DAN had sent him, with dan's name sitting unused in from_user_id.
-- His instruction was categorical: the name must be shown. It is the entire
-- value of a recommendation — an item from nobody is not a recommendation.
--
-- THE FIX IS NOT A NEW FALLBACK. It is that the producer must RESOLVE the
-- sender to one of the recipient's own people before writing, and must record
-- which circles they actually share. Then the card has something true to say
-- and needs no fallback at all.
-- ============================================================================

-- The sender's own name, for when the recipient has no person record of them.
alter table public.suggestions add column if not exists from_name text;

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
  insert into public.suggestions
    (user_id, canonical_id, from_person_id, from_user_id, from_name, via, source_note,
     matched_circles, matched_interest)
  values
    (v_member.linked_user_id, v_rec.canonical_id, v_person, v_me,
     (select name from public.users where id = v_me), 'direct',
     left(coalesce(v_rec.note, ''), 300), v_circles,
     -- NOT an empty string. The card composes a sentence around this value and
     -- '' produced "It matches ." with a dangling stop. A direct send has a
     -- true thing to say: someone chose to send it to you.
     'sent to you directly');

  -- NO SEPARATE NOTIFICATION. It produced a SECOND Inbox entry — a bare line
  -- with no detail, no link and no accept button — duplicating the card with
  -- strictly less information. The suggestion IS the notification.

  return jsonb_build_object('ok', true, 'named_sender', v_person is not null,
                            'shared_circles', coalesce(array_length(v_circles, 1), 0));
end;
$$;

revoke all on function public.send_rec_to_member(uuid, uuid) from public;
grant execute on function public.send_rec_to_member(uuid, uuid) to authenticated;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc where proname = 'send_rec_to_member')       as fn_should_be_1,
  (select count(*) from public.suggestions where matched_interest = '')     as blank_interest_should_be_0,
  (select count(*) from public.suggestions
     where via = 'direct' and from_person_id is null and from_name is null) as unnamed_direct_sends;
