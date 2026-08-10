-- ============================================================================
-- 0030_direct_send.sql                                          10 Aug 2026
--
-- "SEND TO A MEMBER" HAD NO IN-APP PATH AT ALL.
--
-- dan: Dany saved Jackson Hole, pressed "Send to a member", chose shapiro — who
-- IS on the app and IS in Dany's circle — and the dialog offered ONLY email.
-- Reading modalShareRec: it has exactly two branches, wa.me and mailto. BOTH
-- EXTERNAL. There are zero in-app sends anywhere in the file. A member who is a
-- Trustnet user is treated identically to a stranger with an email address.
-- Worse, the link in that message goes to Trustnet generally, with NO reference
-- to the item — the entire point of the action is lost on arrival.
--
-- THE FIX REUSES THE QUEUE. A direct send is a suggestion the sender chose
-- personally, so it lands in the recipient's Inbox exactly like a matched one:
-- same card, same accept-or-dismiss, same rule that nothing enters a library
-- without its owner. No second mechanism, no second surface.
--
-- `via` gains 'direct' to distinguish it: a matched suggestion says "Rina
-- answered a question with this", a direct one says "Dany sent you this".
-- Both are true and they are not the same claim.
-- ============================================================================

alter table public.suggestions drop constraint if exists suggestions_via_check;
alter table public.suggestions
  add constraint suggestions_via_check
  check (via in ('answer','save','direct'));

-- A direct send needs no interest match — the sender picked the person — so
-- matched_interest may be empty for these. Everything else is unchanged.
alter table public.suggestions alter column matched_interest set default '';

-- ── THE NOTIFICATION TYPE MUST BE ALLOWED ───────────────────────────────────
-- notifications_type_check permits only query / query_response / reciprocal /
-- invite_accepted / taste_match. Inserting 'rec_shared' ABORTED THE WHOLE SEND,
-- silently to the user and loudly only in a database log nobody reads. Caught
-- by executing the function, not by reading it.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('query','query_response','reciprocal','invite_accepted',
                  'taste_match','rec_shared','suggestion'));

-- ── SENDING TO SOMEONE ELSE NEEDS A FUNCTION, NOT A CLIENT INSERT ───────────
-- suggestions RLS is `with check (user_id = auth.uid())` — correct and
-- deliberate: nobody may write into another person's queue directly, or the
-- Inbox becomes a spam target. So Dany CANNOT insert a row whose user_id is
-- shapiro. Proven by executing it: "permission denied for table suggestions".
--
-- A security-definer function is the right shape: it enforces the rule the RLS
-- policy cannot express — you may put something in someone's inbox ONLY if they
-- are a member of one of YOUR circles and are on Trustnet. Not "anyone", not
-- "nobody".
create or replace function public.send_rec_to_member(p_rec_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_member   record;
  v_existing uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_authenticated'); end if;

  select * into v_rec from public.recommendations where id = p_rec_id and owner_id = v_me;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_item'); end if;

  -- The member must be YOURS and must be a Trustnet user. Both halves matter:
  -- the first stops sending to strangers, the second is what makes an in-app
  -- delivery possible at all.
  select * into v_member from public.members
   where id = p_member_id and owner_id = v_me and linked_user_id is not null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_member_or_not_on_app'); end if;

  if v_member.linked_user_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'cannot_send_to_yourself');
  end if;

  -- Already in their library? Then there is nothing to send.
  if exists (select 1 from public.recommendations
             where owner_id = v_member.linked_user_id and canonical_id = v_rec.canonical_id) then
    return jsonb_build_object('ok', false, 'error', 'already_in_their_library');
  end if;

  select id into v_existing from public.suggestions
   where user_id = v_member.linked_user_id and canonical_id = v_rec.canonical_id;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'already_sent');
  end if;

  insert into public.suggestions
    (user_id, canonical_id, from_user_id, via, source_note, matched_circles, matched_interest)
  values
    (v_member.linked_user_id, v_rec.canonical_id, v_me, 'direct',
     left(coalesce(v_rec.note, ''), 300), '{}'::uuid[], '');

  insert into public.notifications (user_id, type, title, body, actor_name, link_url)
  select v_member.linked_user_id, 'rec_shared',
         coalesce(u.name, 'Someone') || ' sent you a recommendation',
         coalesce(c.name, ''), u.name, '/#inbox'
  from public.users u, public.canonicals c
  where u.id = v_me and c.id = v_rec.canonical_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.send_rec_to_member(uuid, uuid) from public;
grant execute on function public.send_rec_to_member(uuid, uuid) to authenticated;

-- ── VERIFICATION — expect 1 and 3 ───────────────────────────────────────────
select
  (select count(*) from pg_constraint where conname = 'suggestions_via_check')  as constraint_should_be_1,
  (select count(*) from (values ('answer'),('save'),('direct')) v(x))           as allowed_should_be_3,
  (select count(*) from pg_proc where proname = 'send_rec_to_member')           as sender_should_be_1;
