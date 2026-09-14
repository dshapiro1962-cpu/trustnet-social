-- 0041_search_my_people_own_label.sql
--
-- ONE IDENTITY, MANY NAMES. The rule, restated by dan on 14 Sep 2026:
--
--   The definitive identifier is the phone number or the email. It does not
--   matter that one user calls him "uncle", another "dan" and another
--   "shapiro" - the database knows they are the same person because they share
--   the contact. But when a user types "uncle", THEIR person must come up,
--   because that is the name THEY attached to that phone number.
--
-- search_my_people broke the second half. It matched and returned
-- people.name - a single GLOBAL name, written once by the member_identity
-- trigger at first sighting and never revisited:
--
--     and (p_q is null or btrim(p_q) = '' or p.name ilike '%'||btrim(p_q)||'%')
--
-- Measured on production the same day: three of dan's thirteen people had a
-- PHONE NUMBER as that global name, because the first member row ever created
-- for that contact was made before the name was known. Searching "tal shapiro"
-- returned nothing, though Tal Shapiro is in two of his circles and on the app,
-- and the picker listed "+972523384665" instead of her name.
--
-- It also cannot be fixed by renaming the person. Nine people in this database
-- are shared by more than one owner and they disagree: person
-- 4f8e28bd-29d4-4117-9e38-089e60ccde10 is "dan test" to dan, "דני אח" to Rany,
-- "Dan Shapiro" to Itamar and "daj" to Dany. Any rule that picks a winner
-- rewrites four other people's address books.
--
-- So this matches and returns THE CALLER'S OWN LABEL, from their own members
-- rows. people.name stays exactly as it is and stops being user-facing: it is
-- an internal fallback for the case where the caller somehow has no label.
--
-- Idempotent: create or replace, one statement. Safe to re-run.

-- 1 of 1
create or replace function public.search_my_people(p_q text)
 returns table(person_id uuid, name text, on_trustnet boolean, contacts jsonb, circles jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id,
         -- THE NAME THIS CALLER GAVE THEM. A person may be labelled differently
         -- in two of the caller's own circles ("dan test" in one, "dan test1" in
         -- another); the most recently touched row wins for display, and BOTH
         -- still match in the where clause below, so either spelling finds them.
         coalesce(
           (select m.name
              from public.members m
             where m.person_id = p.id
               and m.owner_id = auth.uid()
               and coalesce(btrim(m.name), '') <> ''
             order by m.updated_at desc nulls last, m.created_at desc
             limit 1),
           p.name),
         (p.linked_user_id is not null) as on_trustnet,
         coalesce((select jsonb_agg(jsonb_build_object('method', pc.method, 'value', pc.value)
                                    order by pc.method)
                   from public.person_contacts pc where pc.person_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                                    order by c.name)
                   from public.members m join public.circles c on c.id = m.circle_id
                   where m.person_id = p.id
                     and m.owner_id = auth.uid()), '[]'::jsonb)
  from public.people p
  where exists (select 1 from public.members m2
                 where m2.person_id = p.id and m2.owner_id = auth.uid())
    and (p_q is null or btrim(p_q) = ''
         -- MATCH ANY LABEL THE CALLER HAS USED FOR THEM, not the global name.
         -- Contact values are searchable too: typing a phone number is a
         -- reasonable way to look for the person it belongs to.
         or exists (select 1 from public.members m3
                     where m3.person_id = p.id
                       and m3.owner_id = auth.uid()
                       and (m3.name ilike '%' || btrim(p_q) || '%'
                            or m3.contact_value ilike '%' || btrim(p_q) || '%')))
  order by 2
  limit 25;
$function$;
