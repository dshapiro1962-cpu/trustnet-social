-- ============================================================================
-- 0050 · WHATSAPP ALREADY SAID THEIR NAME
--
-- dan, 9 Sep: "why dont you take the name from the contact list... whoever
-- joins should not do anything except click."
--
-- He is right about the goal and I had the wrong source. A browser cannot read
-- a phone's address book at all - navigator.contacts.select exists only in
-- Chrome on Android, which is why "Pick from contacts" never appears on an
-- iPhone or a desktop.
--
-- But the name is already arriving. The WhatsApp Cloud API puts the SENDER'S
-- OWN PROFILE NAME on every inbound message:
--
--     "value": {
--       "contacts": [{ "profile": { "name": "..." }, "wa_id": "9725..." }],
--       "messages": [{ "from": "9725...", ... }]
--     }
--
-- whatsapp-webhook reads value.messages[0] and msg.from and has never touched
-- value.contacts[0].profile.name. The comment in complete-join says "WhatsApp
-- does not expose a name" - true of the number alone, wrong about the payload,
-- and I believed it instead of reading it.
--
-- So the name travels with the claim, and the joiner does nothing but press
-- send.
--
-- NO DROP, NO AMBIGUITY. The two-argument function is KEPT and delegates, so
-- the webhook currently deployed keeps working in the window between this
-- migration and the function deploy. The three-argument version takes no
-- default, so the two signatures can never be ambiguous to PostgREST.
--
-- Numbered, idempotent, one statement at a time, no transaction.
-- ============================================================================

-- 1. Somewhere to put it. Nullable: a profile name is not guaranteed, and its
--    absence must mean "we were not told", never an empty name.
alter table public.invite_claims
  add column if not exists claimed_name text;

-- 2. The three-argument form does the work. A name that is blank, or that is
--    just a phone number again, is discarded here rather than downstream -
--    adopting the number as a name is the exact thing this exists to stop.
create or replace function public.record_invite_claim(
  p_token text, p_phone text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link record;
  v_name text;
begin
  select * into v_link from public.circle_invite_links
   where token = p_token and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is not null and v_name ~ '^\+?[0-9][0-9 ()\-]*$' then
    v_name := null;
  end if;
  v_name := left(v_name, 80);

  -- A repeated send must not fail; refresh the existing live claim instead.
  delete from public.invite_claims
   where token = p_token and consumed_at is null;

  insert into public.invite_claims (token, claimed_phone, claimed_name)
  values (p_token, p_phone, v_name);

  return jsonb_build_object('ok', true,
    'circle', (select name from public.circles where id = v_link.circle_id));
end;
$function$;

-- 3. The two-argument form stays and delegates, so nothing that calls it today
--    breaks while the functions are being deployed. Replaced in place - never
--    dropped - so there is no moment when it does not exist.
create or replace function public.record_invite_claim(p_token text, p_phone text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select public.record_invite_claim(p_token, p_phone, null::text);
$function$;

-- 4. Both forms are called by the webhook with the service role, which already
--    bypasses this, but the grant is stated rather than assumed.
grant execute on function public.record_invite_claim(text, text, text) to service_role;
