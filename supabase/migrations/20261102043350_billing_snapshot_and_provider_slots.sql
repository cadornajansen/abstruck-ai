create or replace function public.billing_account_context(p_owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile_created timestamptz; active_grant public.access_grants; plan public.plans; period_start timestamptz;
  period_end timestamptz; period_id uuid; period_limits jsonb;
begin
  select created_at into profile_created from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into active_grant from public.access_grants where owner_id=p_owner_id and state='active'
    and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if found then
    select * into plan from public.plans where id=active_grant.plan_id;
    period_start:=active_grant.starts_at; period_end:=active_grant.ends_at;
  else
    select * into plan from public.plans where code='free';
    period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
    period_end:=period_start+interval '30 days';
  end if;
  insert into public.usage_periods(owner_id,starts_at,ends_at,plan_id,grant_id,limits_snapshot)
    values(p_owner_id,period_start,period_end,plan.id,active_grant.id,plan.limits)
    on conflict(owner_id,starts_at) do update set plan_id=coalesce(usage_periods.plan_id,excluded.plan_id),
      grant_id=coalesce(usage_periods.grant_id,excluded.grant_id),
      limits_snapshot=case when usage_periods.limits_snapshot='{}'::jsonb then excluded.limits_snapshot else usage_periods.limits_snapshot end
    returning id,limits_snapshot into period_id,period_limits;
  return jsonb_build_object('ownerId',p_owner_id,'planId',plan.id,'plan',plan.code,'planVersion',plan.version,'grantId',active_grant.id,
    'periodId',period_id,'startsAt',period_start,'endsAt',period_end,'limits',period_limits);
end $$;


create or replace function public.billing_active_operations(p_owner_id uuid,p_include_queued boolean default true)
returns integer language sql stable security invoker set search_path='' as $$
  select ((select count(*) from public.processing_jobs where owner_id=p_owner_id and
    ((state='queued' and p_include_queued) or (state='running' and lease_until>now()) or state='waiting_provider'))+
    (select count(*) from public.usage_ledger where owner_id=p_owner_id and feature='chat' and status='reserved'
      and updated_at>now()-interval '3 minutes'))::integer;
$$;
