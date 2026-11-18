-- Reuse the durable material-deletion pipeline after a day without upload activity.
create function public.sweep_abandoned_uploads(p_limit integer default 10)
returns integer language plpgsql security invoker set search_path='' as $$
declare candidate record; queued integer:=0;
begin
  if p_limit not between 1 and 50 then raise exception 'invalid_sweep_limit'; end if;
  for candidate in
    select id,owner_id from public.materials
    where status='awaiting_upload' and deleted_at is null
      and updated_at < now()-interval '24 hours'
    order by updated_at limit p_limit
  loop
    -- Use the same owner-before-material lock order as upload/deletion admission.
    perform 1 from public.profiles where id=candidate.owner_id for update skip locked;
    if not found then continue; end if;
    perform 1 from public.materials where id=candidate.id and owner_id=candidate.owner_id
      and status='awaiting_upload' and deleted_at is null
      and updated_at < now()-interval '24 hours' for update skip locked;
    if not found then continue; end if;
    if exists(select 1 from public.account_data_requests where owner_id=candidate.owner_id and kind='deletion') then continue; end if;
    perform public.request_account_data(candidate.owner_id,gen_random_uuid(),'material_deletion',candidate.id);
    queued:=queued+1;
  end loop;
  return queued;
end $$;
revoke all on function public.sweep_abandoned_uploads(integer) from public,anon,authenticated;
grant execute on function public.sweep_abandoned_uploads(integer) to service_role;
