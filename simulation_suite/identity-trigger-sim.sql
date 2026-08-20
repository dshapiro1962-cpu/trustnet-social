-- ═══════════════════════════════════════════════════════════════════════════
-- identity-trigger-sim — drives trg_member_identity against a real Postgres.
--
-- 0036's own verification block checks the DATA and cannot check the TRIGGER:
-- every repair step runs before the trigger is created, so a broken trigger
-- passes it. That is not hypothetical — the first draft used min(uuid), which
-- Postgres does not have, and 0036 reported OK.
--
-- Run: fixture.sql, then 0036, then this. Any failure raises and aborts.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

create or replace function _ck(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_ok then raise notice '  OK   %', p_name;
  else raise exception '  FAIL %  %', p_name, p_detail; end if;
end $$;

do $$
declare
  v_id uuid; v_person uuid; v_link uuid; v_key text; v_n integer; v_err text;
  c_dan   uuid := 'c7af8222-f595-455b-83d4-d848a8bd621a';   -- owner
  c_circ  uuid := '1e6fda4b-157d-4f22-b428-bdd7200ddd72';   -- his dining circle
  c_ski   uuid := '05839ac0-26ae-4061-be3f-bbd01b74c527';
begin
raise notice '── identity trigger ──';

-- 1 ── a brand-new contact gets a person AND a registered contact
insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
values (c_circ, c_dan, 'Brand New', 'email', 'Brand.New@Example.COM')
returning id, person_id, contact_key into v_id, v_person, v_key;
perform _ck('new contact creates a person', v_person is not null);
perform _ck('...and normalises the key', v_key = 'brand.new@example.com', coalesce(v_key,'null'));
select count(*) into v_n from public.person_contacts
 where owner_id = c_dan and key = 'brand.new@example.com';
perform _ck('...and registers it in person_contacts', v_n = 1, v_n::text);

-- 2 ── the same contact in ANOTHER circle reuses the person, never mints one
insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
values (c_ski, c_dan, 'Brand New Again', 'email', 'brand.new@example.com')
returning person_id into v_person;
perform _ck('same contact in another circle reuses the person',
  v_person = (select person_id from public.members where id = v_id));
select count(*) into v_n from public.people where owner_id = c_dan and name like 'Brand New%';
perform _ck('...and creates no second person', v_n = 1, v_n::text);

-- 3 ── THE GUARANTEE: the same person twice in one circle is refused
begin
  insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
  values (c_circ, c_dan, 'Brand New Duplicate', 'email', 'brand.new@example.com');
  perform _ck('duplicate membership in one circle is REFUSED', false, 'insert succeeded');
exception when unique_violation then
  perform _ck('duplicate membership in one circle is REFUSED', true);
end;

-- 4 ── the fault link_member_row had: phone formats that differ textually
--      but are the same human. users.phone is '0505543402'.
insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
values (c_ski, c_dan, 'dan by intl phone', 'whatsapp', '+972505543402')
returning linked_user_id into v_link;
perform _ck('phone links across formats (+972... vs 0...)',
  v_link = c_dan, coalesce(v_link::text,'null'));

-- 5 ── ambiguity must NOT guess. Two users on one phone -> leave it null.
insert into public.users (id, email, phone, name)
values ('22222222-2222-2222-2222-222222222222','twin@example.com','0505543402','twin');
insert into public.members (circle_id, owner_id, name, contact_method, contact_value)
values (c_circ, c_dan, 'ambiguous phone', 'whatsapp', '+972505543402')
returning linked_user_id into v_link;
perform _ck('two users on one phone links NEITHER', v_link is null, coalesce(v_link::text,'set'));
delete from public.users where id = '22222222-2222-2222-2222-222222222222';

-- 6 ── no contact: no person, no link, no invention
insert into public.members (circle_id, owner_id, name)
values (c_circ, c_dan, 'No Contact At All')
returning person_id, linked_user_id, contact_key into v_person, v_link, v_key;
perform _ck('a contactless member gets NO person', v_person is null);
perform _ck('...no link', v_link is null);
perform _ck('...and no contact_key', v_key is null);

-- 7 ── an explicit person_id is respected, and its contact still gets registered
insert into public.members (circle_id, owner_id, name, contact_method, contact_value, person_id)
values (c_ski, c_dan, 'Explicit Person', 'email', 'explicit@example.com',
        (select id from public.people where owner_id = c_dan and name = 'yossi'))
returning person_id into v_person;
perform _ck('an explicitly supplied person_id is kept',
  v_person = (select id from public.people where owner_id = c_dan and name = 'yossi'));
select count(*) into v_n from public.person_contacts
 where owner_id = c_dan and key = 'explicit@example.com' and person_id = v_person;
perform _ck('...and its contact is registered anyway', v_n = 1, v_n::text);

-- 8 ── UPDATE path: filling in a contact later derives identity
insert into public.members (circle_id, owner_id, name)
values (c_ski, c_dan, 'Filled In Later') returning id into v_id;
update public.members set contact_method = 'email', contact_value = 'later@example.com'
 where id = v_id;
select person_id, contact_key into v_person, v_key from public.members where id = v_id;
perform _ck('adding a contact to an existing member derives the person', v_person is not null);
perform _ck('...and sets contact_key', v_key = 'later@example.com', coalesce(v_key,'null'));

-- 9 ── 'source' rows are not people and must not be given one
insert into public.members (circle_id, owner_id, name, contact_method, contact_value,
                            is_external_source, source_type)
values (c_ski, c_dan, 'A Critic', 'source', 'https://example.com/critic', true, 'critic')
returning person_id into v_person;
perform _ck('an external source gets no person', v_person is null);

raise notice '── all identity trigger checks passed ──';
end $$;

drop function _ck(text, boolean, text);
