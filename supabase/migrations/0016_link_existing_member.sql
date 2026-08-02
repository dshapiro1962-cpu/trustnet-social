-- ============================================================================
-- 0016_link_existing_member.sql
--
-- WHY: linking a circle member to their Trustnet account only ever happened at
-- SIGNUP (link_member_on_signup). So adding someone who ALREADY has an account
-- left them unlinked: no "On Trustnet" indication for the adder, and no in-app
-- doorway for the member — they'd be emailed/WhatsApped like a stranger even
-- though they're sitting in the app.
--
-- WHAT: a security-definer function that checks whether a contact matches an
-- existing account and, if so, stamps linked_user_id on the member row.
-- It returns ONLY a boolean — never an id, name or email — so it cannot be used
-- to enumerate or probe the user base beyond "is this contact of mine a user".
-- The caller must own the member row.
-- ============================================================================

create or replace function link_member_to_existing_user(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_method  text;
  v_value   text;
  v_user    uuid;
  v_digits  text;
begin
  select owner_id, contact_method, contact_value
    into v_owner, v_method, v_value
  from members
  where id = p_member_id;

  if v_owner is null or v_owner <> auth.uid() then
    return false;                      -- not yours: nothing to see here
  end if;
  if v_value is null or length(trim(v_value)) = 0 then
    return false;
  end if;

  if v_method = 'email' then
    select id into v_user
    from auth.users
    where lower(email) = lower(trim(v_value))
    limit 1;
  elsif v_method = 'whatsapp' then
    -- compare digits only: +972 50-123-4567 == 0501234567 == 972501234567
    v_digits := regexp_replace(v_value, '\D', '', 'g');
    v_digits := right(v_digits, 9);     -- last 9 digits identify an IL mobile
    select id into v_user
    from auth.users
    where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_digits
      and length(coalesce(phone, '')) > 0
    limit 1;
  end if;

  if v_user is null then
    return false;
  end if;
  if v_user = auth.uid() then
    return false;                      -- you are not your own member
  end if;

  update members set linked_user_id = v_user where id = p_member_id;
  return true;
end;
$$;

revoke all on function link_member_to_existing_user(uuid) from public;
grant execute on function link_member_to_existing_user(uuid) to authenticated;

-- verification
select
  (select count(*) from pg_proc where proname = 'link_member_to_existing_user') as fn_exists,
  (select count(*) from information_schema.columns
     where table_name = 'members' and column_name = 'linked_user_id') as has_column;
