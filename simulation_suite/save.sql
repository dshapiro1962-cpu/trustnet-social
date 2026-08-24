set role app_user;
set sim.uid='dddddddd-0000-4000-8000-000000000001';
set sim.role='authenticated';
insert into public.canonicals (id,type,name,created_by)
values (gen_random_uuid(),'place','tony vespa','dddddddd-0000-4000-8000-000000000001');
