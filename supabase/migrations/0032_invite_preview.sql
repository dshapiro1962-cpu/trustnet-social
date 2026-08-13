-- ============================================================================
-- 0032_invite_preview.sql                                       13 Aug 2026
--
-- YUVAL TAPPED A WHATSAPP INVITE AND SAW A LOGIN FORM ASKING FOR A CODE HE HAD
-- NEVER BEEN SENT.
--
-- The plumbing was never broken: boot() captures ?join=, stores it, and the
-- token is consumed after sign-in. What was missing is CONTEXT. The invitation
-- was invisible at exactly the moment it needed to be visible — a stranger's
-- first ever contact with Trustnet was an unexplained code field.
--
-- To say "dan is inviting you to his ski circle" BEFORE sign-in, the page needs
-- to resolve the token while the visitor is anonymous. Hence a SECURITY DEFINER
-- function callable by `anon`.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: no member list, no member count, no
-- email, no phone, no circle id, no recommendations. A token holder learns the
-- inviter's FIRST NAME and the CIRCLE NAME — exactly what the invitation itself
-- already told them — and nothing more. Anyone guessing tokens learns nothing
-- they could not learn by being invited.
--
-- Only ACTIVE links resolve, so revoke_circle_link genuinely revokes.
-- ============================================================================

create or replace function public.invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link   record;
  v_circle record;
  v_owner  text;
begin
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_token');
  end if;

  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;
  if not found then
    -- Same answer for an unknown token and a revoked one: a probe must not be
    -- able to tell the difference.
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_circle from public.circles where id = v_link.circle_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- FIRST NAME ONLY. "dan is inviting you", not the owner's full identity.
  select split_part(coalesce(name, ''), ' ', 1) into v_owner
    from public.users where id = v_link.owner_id;

  return jsonb_build_object(
    'ok', true,
    'inviter', nullif(v_owner, ''),
    'circle',  v_circle.name
  );
end;
$$;

-- Callable by an ANONYMOUS visitor — that is the entire point: they have not
-- signed in yet and must see who invited them before being asked to.
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- ── VERIFICATION ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_proc where proname = 'invite_preview')          as fn_should_be_1,
  (public.invite_preview('definitely-not-a-real-token') ->> 'ok')          as unknown_should_be_false;
