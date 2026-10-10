-- ============================================================================
-- 0057 · THE PHONE ON AN ACCOUNT IS SET BY THE SERVER
--
-- dan, 10 Oct 2026: WhatsApp sign-in put him in an EMPTY account. His number is
-- on his email account (8 circles, 124 recommendations), complete-join finds
-- that account by it - and then minted the session for wa<number>@wa.trustnet
-- .local, a different address, which on 5 Oct became an account of its own.
-- complete-join now opens the account it found.
--
-- THAT FIX IS ONLY SAFE WITH THIS ONE. users.phone decides which account a
-- WhatsApp sign-in opens, and until now any signed-in user could write any
-- number into their own row: the policy users_self covers ALL, and the column
-- is writable by `authenticated` (checked live, 10 Oct). The app has never
-- written it - saveProfile leaves phone out - so the only honest writers are
-- the server, after WhatsApp has proven the number: complete-join when it
-- creates an account, and wa-signin's old backfill.
--
-- So: a statement run as `authenticated` or `anon` may not set or change it.
-- Service role and postgres - the server and migrations - are unaffected.
-- It RAISES rather than quietly keeping the old value, so an attempt is seen.
-- saveProfile's upsert does not name the column: on insert phone is null, on
-- conflict it is left as it was, and neither trips this.
--
-- MEASURED BEFORE: 16 accounts carry a phone; no number is on two of them; 15
-- were made by WhatsApp. dan's email account is the one exception.
--
-- Run each numbered statement on its own. Both are idempotent.
-- ============================================================================

-- 1 · the rule
create or replace function public.users_phone_is_server_only()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- current_user is the role running the statement: `authenticated` or `anon`
  -- for anything that came through the API with a user's token. Not SECURITY
  -- DEFINER, deliberately - that would make current_user the owner.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.phone is not null then
      raise exception 'users.phone is set by the server, not by the account holder'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.phone is distinct from old.phone then
      raise exception 'users.phone is set by the server, not by the account holder'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

-- 2 · armed on every insert and update
create or replace trigger trg_users_phone_server_only
  before insert or update on public.users
  for each row execute function public.users_phone_is_server_only();
