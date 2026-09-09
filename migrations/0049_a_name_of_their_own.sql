-- ============================================================================
-- 0049 · A NAME OF THEIR OWN
--
-- dan's inbox, 9 Sep 2026:
--
--     +972548820630 joined your Travel circle
--     +972528640029 joined your Travel circle
--     +972523972011 joined your Travel circle
--
-- Four neighbours joined through the codeless WhatsApp flow in three hours and
-- every one of them arrived as a phone number. dan renamed them by hand.
--
-- WHY. WhatsApp does not expose a name, so complete-join has only one place to
-- look: a member row the inviter already wrote for that number. It looks - the
-- code is there and it is correct - but it looks a second too early. Measured:
--
--     Rany Shapiro   account 14:41:18.79  ->  member row 14:41:19.68
--     may shapiro    account 15:36:51.42  ->  member row 15:36:52.62
--
-- The member row does not exist yet; the join creates it a second later. So
-- `invitedName` is null and the placeholder wins. For a genuine stranger there
-- is no earlier row to find either, so no amount of moving that lookup helps:
-- NOBODY KNOWS THEIR NAME YET. The only person who does is them.
--
-- So the client now asks them (v0.85.0), and this function carries the answer
-- out to the circles they are already in - which they cannot do themselves,
-- because those member rows belong to the people who invited them and RLS
-- rightly refuses.
--
-- DELIBERATELY NARROW. It touches only rows already linked to the caller, and
-- only where the stored name is still a bare phone number. It can never
-- overwrite a label somebody typed - including the three dan fixed by hand.
--
-- Idempotent, one statement, no transaction (the SQL editor gives each
-- statement its own connection).
-- ============================================================================

-- 1. Replace the placeholder name on every member row that points at me.
--    Returns how many were changed, so the caller can tell nothing-to-do from
--    a silent failure.
create or replace function public.adopt_my_name()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_n    integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select name into v_name from public.users where id = v_uid;

  -- NEVER PROPAGATE A PLACEHOLDER. If my own name is still a phone number
  -- there is nothing worth copying, and writing it everywhere would cement the
  -- very thing this exists to remove. Same shape of test as complete-join.
  if v_name is null
     or btrim(v_name) = ''
     or v_name ~ '^\+?[0-9][0-9 ()\-]*$' then
    return 0;
  end if;

  -- ONLY PLACEHOLDERS ARE REPLACED. A member row whose name a human typed is
  -- that owner's own label and is never touched - dan's rule, and the reason
  -- the three rows he corrected by hand survive this untouched.
  update public.members
     set name = v_name
   where linked_user_id = v_uid
     and name ~ '^\+?[0-9][0-9 ()\-]*$';

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- 2. Every signed-in user may call it. It can only ever act on rows already
--    linked to the caller, so there is nothing to scope further.
grant execute on function public.adopt_my_name() to authenticated;
