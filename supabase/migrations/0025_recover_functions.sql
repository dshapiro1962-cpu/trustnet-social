-- ============================================================================
-- 0025_recover_functions.sql                                     6 Aug 2026
--
-- SEVEN FUNCTIONS THAT EXISTED ONLY IN PRODUCTION.
--
-- 0018 reconciled TABLES and COLUMNS from the lost 0002-0009 era. It never
-- looked at FUNCTIONS. So "the repo can rebuild the database" — demonstrated by
-- 17 tables applying cleanly — was true and MISLEADING: a rebuilt database had
-- every table and was missing seven functions the app calls on ordinary
-- screens. Opening the inbox, following a shared link, or correcting a category
-- would have failed on a fresh environment. schema-sim never checked functions
-- either, so the guard shared the blind spot. Same shape as the pgvector
-- ordering bug: I verified what I thought to verify, and the gap was in what I
-- did not.
--
-- Transcribed VERBATIM from pg_get_functiondef on production, 6 Aug 2026.
-- Not reconstructed, not improved — a transcript.
--
-- Two claims in earlier handoff entries were WRONG and are corrected here:
--   * category_corrections is NOT dead. correct_category writes to it and the
--     app calls that RPC. The earlier "zero references" check grepped the TABLE
--     name and missed the FUNCTION.
--   * shared_to_network IS read: network_feed filters on it.
--
-- Idempotent (all CREATE OR REPLACE). Safe on production — identical to what is
-- already deployed.
-- ============================================================================

-- ── the user's own correction of an AI category, with an audit trail ─────────
CREATE OR REPLACE FUNCTION public.correct_category(p_canonical_id uuid, p_category text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old text;
begin
  if p_category not in ('dining','travel','healthcare','home','culture',
                        'hobbies','professional','other') then
    return;
  end if;
  -- caller must created the canonical or own a rec referencing it
  if not exists (
    select 1 from public.canonicals c
    where c.id = p_canonical_id and c.created_by = auth.uid()
    union
    select 1 from public.recommendations r
    where r.canonical_id = p_canonical_id and r.owner_id = auth.uid()
  ) then
    return;
  end if;

  select primary_category into v_old from public.canonicals where id = p_canonical_id;

  update public.canonicals
     set primary_category = p_category,
         class_source = 'user',
         classified_at = now()
   where id = p_canonical_id;

  insert into public.category_corrections
    (canonical_id, old_category, new_category, corrected_by)
  values (p_canonical_id, v_old, p_category, auth.uid());
end;
$function$;

-- ── the reusable "share one link" invite ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_circle_link(p_circle_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
begin
  if not exists (select 1 from public.circles
                 where id = p_circle_id and owner_id = auth.uid()) then
    return null;
  end if;

  select token into v_token from public.circle_invite_links
   where circle_id = p_circle_id and active = true
   limit 1;

  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    insert into public.circle_invite_links (token, circle_id, owner_id)
    values (v_token, p_circle_id, auth.uid());
  end if;

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_circle_link(p_circle_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.circle_invite_links
     set active = false
   where circle_id = p_circle_id
     and owner_id = auth.uid();
$function$;

-- ── joining someone else's circle from a link ───────────────────────────────
CREATE OR REPLACE FUNCTION public.join_circle_via_link(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link record;
  v_circle record;
  v_owner_name text;
  v_me record;
begin
  if auth.uid() is null then
    return jsonb_build_object('joined', false, 'reason', 'not_signed_in');
  end if;

  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;
  if not found then
    return jsonb_build_object('joined', false, 'reason', 'invalid');
  end if;

  select * into v_circle from public.circles where id = v_link.circle_id;
  if not found then
    return jsonb_build_object('joined', false, 'reason', 'invalid');
  end if;
  select name into v_owner_name from public.users where id = v_link.owner_id;

  if auth.uid() = v_link.owner_id then
    return jsonb_build_object('joined', false, 'reason', 'own_circle',
                              'circle_name', v_circle.name);
  end if;

  select * into v_me from public.users where id = auth.uid();
  if not found then
    return jsonb_build_object('joined', false, 'reason', 'no_profile');
  end if;

  if exists (select 1 from public.members
             where circle_id = v_link.circle_id and linked_user_id = auth.uid()) then
    return jsonb_build_object('joined', true, 'already', true,
                              'circle_name', v_circle.name, 'owner_name', v_owner_name);
  end if;

  insert into public.members
    (owner_id, circle_id, name, avatar, avatar_color, trust_basis,
     contact_method, contact_value, response_rate, linked_user_id)
  values
    (v_link.owner_id, v_link.circle_id, v_me.name, v_me.avatar, v_me.avatar_color,
     'Joined via invite link', 'email', v_me.email, 'unknown', auth.uid());

  update public.circle_invite_links set uses = uses + 1 where id = v_link.id;

  insert into public.notifications (user_id, type, title, body, circle_id, actor_name)
  values (v_link.owner_id, 'invite_accepted',
          v_me.name || ' joined your ' || v_circle.name || ' circle',
          'They joined via your invite link and can now receive your queries.',
          v_circle.id, v_me.name);

  return jsonb_build_object('joined', true, 'already', false,
                            'circle_name', v_circle.name, 'owner_name', v_owner_name);
end;
$function$;

-- ── "questions I have answered" — the no-app responder's own history ────────
-- NOTE: matches by linked_user_id OR by lowercased email. That email fallback
-- is a THIRD identity rule, alongside phone_key (0017) and contact_key (0022).
-- Not changed here — this file is a transcript — but recorded as a real
-- inconsistency worth resolving.
CREATE OR REPLACE FUNCTION public.my_answered_queries()
 RETURNS TABLE(query_id uuid, query_text text, asker_name text, circle_name text, responded_at timestamp with time zone, rec_name text, rec_note text, rec_location text, rec_emoji text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    q.id,
    q.text,
    u.name,
    c.name,
    qr.responded_at,
    qr.rec_name,
    qr.rec_note,
    qr.rec_location,
    qr.rec_emoji
  from public.query_responses qr
  join public.members m  on m.id = qr.member_id
  join public.queries q  on q.id = qr.query_id
  join public.users   u  on u.id = q.sent_by
  left join public.circles c on c.id = q.circle_id
  where qr.responded_at is not null
    and (
      m.linked_user_id = auth.uid()
      or (
        m.contact_value is not null
        and lower(m.contact_value) = lower(coalesce(
          (select email from public.users where id = auth.uid()), ''
        ))
      )
    )
  order by qr.responded_at desc;
$function$;

-- ── the network feed. THIS is what reads shared_to_network. ─────────────────
CREATE OR REPLACE FUNCTION public.network_feed()
 RETURNS TABLE(rec_id uuid, canonical_id uuid, recommender_id uuid, recommender_name text, domain text, circle_name text, note text, rating smallint, tags text[], shared_at timestamp with time zone, can_name text, can_category text, can_location text, can_emoji text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
    select distinct on (r.id)
      r.id as rec_id, r.canonical_id, r.owner_id as recommender_id,
      u.name as recommender_name,
      coalesce(cn.primary_category, rc.domain) as domain,
      rc.name as circle_name, r.note, r.rating, r.tags,
      r.created_at as shared_at,
      cn.name as can_name, cn.category as can_category,
      cn.location as can_location, cn.image_emoji as can_emoji
    from public.recommendations r
    join public.users u  on u.id  = r.owner_id
    join public.circles rc on rc.id = r.circle_id
    join public.canonicals cn on cn.id = r.canonical_id
    join public.members m on m.linked_user_id = r.owner_id
                         and m.owner_id = auth.uid()
    join public.circles vc on vc.id = m.circle_id
                          and vc.domain = coalesce(cn.primary_category, rc.domain)
    where r.shared_to_network = true
      and r.owner_id <> auth.uid()
    order by r.id, r.created_at desc
  ) feed
  order by feed.shared_at desc
  limit 50
$function$;

-- ── picking a winning answer, and thanking whoever gave it ──────────────────
CREATE OR REPLACE FUNCTION public.resolve_query(p_query_id uuid, p_response_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q record;
  v_r record;
  v_member record;
  v_me text;
  v_note_sent boolean := false;
  v_note_err text := null;
begin
  select * into v_q from public.queries
   where id = p_query_id and sent_by = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'query_not_found_or_not_yours');
  end if;

  begin
    update public.queries
       set resolved_at = now(),
           chosen_response_id = p_response_id
     where id = p_query_id;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'update_failed: ' || sqlerrm);
  end;

  -- the thank-you: best-effort, NEVER blocks the decide
  if p_response_id is not null then
    begin
      select * into v_r from public.query_responses
       where id = p_response_id and query_id = p_query_id;
      if found and v_r.member_id is not null then
        select * into v_member from public.members where id = v_r.member_id;
        if found and v_member.linked_user_id is not null then
          select name into v_me from public.users where id = auth.uid();
          insert into public.notifications (user_id, type, title, body, actor_name)
          values (
            v_member.linked_user_id,
            'pick_won',
            coalesce(v_me, 'Someone') || ' chose your recommendation',
            'Your pick "' || coalesce(v_r.rec_name, '') || '" won for: "' || left(v_q.text, 120) || '"',
            v_me
          );
          v_note_sent := true;
        end if;
      end if;
    exception when others then
      v_note_err := sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true, 'note_sent', v_note_sent, 'note_error', v_note_err);
end;
$function$;

-- ── VERIFICATION — expect 7 ─────────────────────────────────────────────────
select count(*) as functions_should_be_7
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('correct_category','get_or_create_circle_link','revoke_circle_link',
                    'join_circle_via_link','my_answered_queries','network_feed','resolve_query');
