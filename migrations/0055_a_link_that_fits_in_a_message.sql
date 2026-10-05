-- 0055 · A LINK THAT FITS IN A MESSAGE
--
-- MEASURED ON DAN'S PHONE, 5 Oct 2026. The invite link is 65 characters:
--
--   https://  trustnetsocial.com  /?join=  2f8a9c1e4b7d3056a1c8e2f5b9d4a7c3
--      8    +        18         +   7    +               32
--
-- At his text size that is THREE LINES of blue, under a logo, above the first
-- word he actually wrote. A 25-character test link already wrapped to two, so
-- this is not a rounding error; the link is the biggest thing in the message.
--
-- Three changes together get it to 32: the domain moved to trustnetsocial.com
-- (0.99.4), the path becomes /j/ (a Netlify redirect, no SQL), and the token
-- comes down from 32 characters to 11. This is the last one.
--
-- SECURITY, STATED PLAINLY. 32 hex characters is 128 bits. Eleven characters
-- of base64url from 8 random bytes is 64. That is a real reduction and it is
-- still far beyond guessing: 1.8e19 possibilities, against a link that is also
-- rate-limited by being an HTTPS endpoint. For comparison, every password
-- anyone has ever chosen is worse. The alternative - keeping 128 bits - costs
-- three lines in every invitation, which is a cost paid by every recipient
-- rather than by an attacker.
--
-- OLD TOKENS KEEP WORKING. Nothing is migrated and nothing is invalidated:
-- the column is text, every lookup is by equality, and a 32-character token
-- already in someone's WhatsApp resolves exactly as it did. This only changes
-- what NEW links look like.
--
-- Each statement is numbered, idempotent and independent.

-- ── 1 · eleven URL-safe characters, and no two the same ───────────────────
-- base64 of 8 bytes is 12 characters with one '=' of padding. Dropping the
-- padding and translating the two URL-hostile characters leaves 11 that are
-- safe anywhere in a path: + becomes -, / becomes _.
--
-- SCHEMA-QUALIFIED, the lesson of 0053. pgcrypto lives in `extensions` on
-- Supabase, not `public`, and this function pins search_path = public, so an
-- unqualified gen_random_bytes raises "does not exist" the first time anything
-- calls it - which a migration dry run CANNOT catch, because
-- `create or replace function` parses a body without resolving the names in
-- it. Only executing it finds that.
create or replace function public.short_link_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_tries int := 0;
begin
  loop
    v_token := translate(
      rtrim(encode(extensions.gen_random_bytes(8), 'base64'), '='),
      '+/', '-_');
    exit when not exists (
      select 1 from public.circle_invite_links where token = v_token);
    v_tries := v_tries + 1;
    if v_tries > 12 then
      -- Twelve collisions against 1.8e19 possibilities means something is
      -- wrong with the random source, not with luck. Fall back to the old
      -- 32-character form rather than loop for ever or hand back a duplicate.
      return replace(gen_random_uuid()::text, '-', '');
    end if;
  end loop;
  return v_token;
end;
$$;

revoke all on function public.short_link_token() from public;

-- ── 2 · the link generator uses it ────────────────────────────────────────
-- Otherwise unchanged from 0025: same ownership check, same reuse of an
-- existing active link, same return. Only the shape of a NEW token differs.
create or replace function public.get_or_create_circle_link(p_circle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
    v_token := public.short_link_token();
    insert into public.circle_invite_links (token, circle_id, owner_id)
    values (v_token, p_circle_id, auth.uid());
  end if;

  return v_token;
end;
$$;

-- ── 3 · same grants as 0025 left them ─────────────────────────────────────
grant execute on function public.get_or_create_circle_link(uuid) to authenticated;
