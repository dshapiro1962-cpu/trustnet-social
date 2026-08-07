-- ============================================================================
-- repair_person_links.sql                                        6 Aug 2026
--
-- REPAIRS THE DAMAGE FROM v0.45.0.
--
-- WHAT HAPPENED: saveMembers wrote person_id from m.personId, and loadUserData
-- never read person_id back — so m.personId was ALWAYS undefined and every save
-- wrote NULL. Because saveMembers upserts the WHOLE table, a single member edit
-- nulled person_id for EVERY member. 14 of 21 links from 0022 were destroyed.
--
-- The consequence dan hit: resolve_contact returns 'in_circle' only when
-- members.person_id matches, so with the links gone it fell through to
-- 'found_person' — "this contact belongs to dan test2" — he confirmed, and a
-- DUPLICATE membership was created. The app said someone was already there and
-- added them anyway.
--
-- NOTHING IS LOST: people and person_contacts were untouched. The links are
-- rebuilt from the contact, exactly as 0022 did — identity by contact, never
-- by name.
--
-- RUN THIS ONLY AFTER DEPLOYING v0.46.0. On v0.45.0 the next save wipes it again.
--
-- Idempotent: re-running repairs nothing further.
-- ============================================================================

-- ── 1. relink members whose contact matches a person you already have ───────
update public.members m
set person_id = pc.person_id
from public.person_contacts pc
where m.person_id is null
  and pc.owner_id = m.owner_id
  and pc.method   = m.contact_method
  and pc.key      = public.contact_key(m.contact_method, m.contact_value);

-- ── 2. anything still unlinked gets its OWN person ──────────────────────────
-- Contactless members cannot be matched to anyone. Grouping them by NAME would
-- be exactly the guess the whole people model exists to remove: three Marks are
-- three people. Under-merging is correctable by hand; a wrong merge silently
-- fuses two humans.
do $$
declare r record; v_person uuid;
begin
  for r in select id, owner_id, name, linked_user_id, contact_method, contact_value
           from public.members where person_id is null
  loop
    insert into public.people (owner_id, name, linked_user_id)
    values (r.owner_id, r.name, r.linked_user_id)
    returning id into v_person;

    if public.contact_key(r.contact_method, r.contact_value) is not null then
      insert into public.person_contacts (person_id, owner_id, method, value, key)
      values (v_person, r.owner_id, r.contact_method, r.contact_value,
              public.contact_key(r.contact_method, r.contact_value))
      on conflict do nothing;
    end if;

    update public.members set person_id = v_person where id = r.id;
  end loop;
end $$;

-- ── 3. remove duplicate memberships created while the links were broken ─────
-- Same person, same circle, more than one row. Survivor keeps the history:
-- answers are RE-POINTED before any deletion, because deleting a member who
-- answered a question would orphan the answer, and answers are the product.
do $$
declare g record; v_keep uuid; n int := 0;
begin
  for g in
    select person_id, circle_id from public.members
    where person_id is not null
    group by person_id, circle_id having count(*) > 1
  loop
    select m.id into v_keep
    from public.members m
    left join (select member_id, count(*) c from public.query_responses group by member_id) q
           on q.member_id = m.id
    where m.person_id = g.person_id and m.circle_id = g.circle_id
    order by coalesce(q.c, 0) desc, m.created_at asc
    limit 1;

    update public.query_responses set member_id = v_keep
    where member_id in (select id from public.members
                        where person_id = g.person_id and circle_id = g.circle_id and id <> v_keep);

    delete from public.members
    where person_id = g.person_id and circle_id = g.circle_id and id <> v_keep;
    n := n + 1;
  end loop;
  raise notice 'Collapsed % duplicated memberships.', n;
end $$;

-- ── VERIFICATION — all three must be 0 ──────────────────────────────────────
select
  (select count(*) from public.members where person_id is null)      as unlinked_should_be_0,
  (select count(*) from (
     select person_id, circle_id from public.members
     where person_id is not null
     group by person_id, circle_id having count(*) > 1) d)           as duplicates_should_be_0,
  (select count(*) from public.query_responses qr
     where qr.member_id is not null
       and not exists (select 1 from public.members m where m.id = qr.member_id))
                                                                     as orphaned_should_be_0;
