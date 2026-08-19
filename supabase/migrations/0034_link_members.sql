-- ============================================================================
-- 0034_link_members.sql                                         19 Aug 2026
--
-- THE CLIENT CANNOT SET members.linked_user_id, AND HAS BEEN WRITING RUBBISH.
--
-- resolve_contact (0024) deliberately returns NO user id for a stranger — only
-- `on_trustnet: true` — so that nobody can enumerate who is registered. That
-- privacy decision was right and stands.
--
-- But it left the client with no id to store, so handleSaveMember does:
--     if (resolved.on_trustnet) reuseLinked = true;
--     ... linkedUserId: reuseLinked || null
-- `true` IS NOT A USER ID — and linked_user_id is a uuid column, so the write
-- is REJECTED outright ("invalid input syntax for type uuid"). Proven by trying
-- it. saveMembers upserts the whole array, so the failure is not even confined
-- to that one field. Either way the member ends up with linked_user_id NULL,
-- and nine functions then treat a real Trustnet user as a stranger.
--
-- NINE FUNCTIONS BRANCH ON THAT FIELD — send-query, send-collection,
-- resend-member, check-similar-query, check-reciprocal, update-taste-match,
-- suggest-sweep among them — and NONE re-checks it. That is precisely why dan's
-- end-to-end test showed "app_doorways: 0": the member had a valid contact
-- matching a real account, the link was wrong, and send-query treated a
-- Trustnet user as a stranger with no in-app notification.
--
-- THE FIX HAS TO BE SERVER-SIDE. The browser must never learn the id; the
-- server sets it. link_member() therefore takes a member the CALLER OWNS,
-- resolves its contact itself, writes the link, and returns only a boolean.
-- ============================================================================

-- ── the guarantee: called after a member is created or its contact changes ──
create or replace function public.link_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_member record;
  v_key    text;
  v_user   uuid;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- YOUR OWN MEMBER ONLY. Without this, anyone could probe arbitrary member
  -- rows and learn which contacts have accounts — the enumeration
  -- resolve_contact exists to prevent.
  select * into v_member from public.members
   where id = p_member_id and owner_id = v_me;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_your_member');
  end if;

  if v_member.contact_value is null or btrim(v_member.contact_value) = '' then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'no_contact');
  end if;

  v_key := public.contact_key(v_member.contact_method, v_member.contact_value);
  if v_key is null then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'unusable_contact');
  end if;

  -- PHONE **OR** EMAIL, never one alone. Matching on phone only is what gives
  -- an email-era user a SECOND ACCOUNT when they later arrive by WhatsApp.
  if v_member.contact_method = 'whatsapp' then
    select u.id into v_user from public.users u
     where u.phone_key is not null and u.phone_key = v_key limit 1;
  elsif v_member.contact_method = 'email' then
    select u.id into v_user from public.users u
     where u.email is not null and lower(btrim(u.email)) = v_key limit 1;
  end if;

  if v_user is null then
    -- Not on Trustnet. Clear any stale link rather than leaving it: a contact
    -- can change, and a link that no longer matches is worse than none,
    -- because nine functions read it as "this person is on the app".
    update public.members set linked_user_id = null
     where id = p_member_id and linked_user_id is not null;
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'not_on_trustnet');
  end if;

  if v_user = v_me then
    return jsonb_build_object('ok', true, 'linked', false, 'reason', 'that_is_you');
  end if;

  update public.members set linked_user_id = v_user where id = p_member_id;
  -- Only a boolean leaves this function. The browser never learns the id.
  return jsonb_build_object('ok', true, 'linked', true);
end;
$$;

revoke all on function public.link_member(uuid) from public;
grant execute on function public.link_member(uuid) to authenticated;

-- ── the repair: every existing member, once ─────────────────────────────────
-- Runs as the migration (no auth.uid()), so it cannot use link_member itself.
-- Same rule, applied in bulk.
do $$
declare n_linked int := 0; n_cleared int := 0;
begin
  -- Clear anything wrong first. A dangling link is ALREADY impossible —
  -- members_linked_user_id_fkey enforces it, confirmed by trying to insert one
  -- — so in practice this only catches a member linked to its own owner. Kept
  -- because it costs nothing and the FK could be dropped by a later migration.
  update public.members m set linked_user_id = null
   where m.linked_user_id is not null
     and (m.linked_user_id = m.owner_id
          or not exists (select 1 from public.users u where u.id = m.linked_user_id));
  get diagnostics n_cleared = row_count;

  -- Then link every member whose contact matches a real account.
  update public.members m
     set linked_user_id = u.id
    from public.users u
   where m.linked_user_id is null
     and m.contact_value is not null
     and u.id <> m.owner_id
     and (
       (m.contact_method = 'whatsapp' and u.phone_key is not null
          and u.phone_key = public.contact_key('whatsapp', m.contact_value))
       or
       (m.contact_method = 'email' and u.email is not null
          and lower(btrim(u.email)) = public.contact_key('email', m.contact_value))
     );
  get diagnostics n_linked = row_count;

  raise notice 'link repair: % cleared, % linked', n_cleared, n_linked;
end $$;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc where proname = 'link_member')        as fn_should_be_1,
  (select count(*) from public.members m
     where m.linked_user_id is not null
       and not exists (select 1 from public.users u where u.id = m.linked_user_id))
                                                                      as broken_links_should_be_0,
  (select count(*) from public.members m
     join public.users u on u.email is not null
       and lower(btrim(u.email)) = public.contact_key('email', m.contact_value)
    where m.contact_method = 'email' and m.linked_user_id is null and u.id <> m.owner_id)
                                                                      as still_unlinked_should_be_0;
