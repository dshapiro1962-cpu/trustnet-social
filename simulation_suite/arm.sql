create or replace trigger canonicals_identity_fold_trg before insert on public.canonicals
  for each row execute function public.canonicals_identity_fold();
create or replace trigger canonicals_identity_enqueue_trg after insert on public.canonicals
  for each row execute function public.canonicals_identity_enqueue();
create or replace trigger recs_point_at_head_trg before insert or update of canonical_id on public.recommendations
  for each row execute function public.recs_point_at_head();
