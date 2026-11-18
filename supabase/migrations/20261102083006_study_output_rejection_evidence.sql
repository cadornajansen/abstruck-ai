alter table public.generation_runs add column rejected_output jsonb;

create function public.checkpoint_study_rejection(p_job_id uuid,p_lease_token uuid,p_reason text,p_payload jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run_id uuid;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() or job.study_set_id is null then return false; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536 or coalesce(length(p_reason),0) not between 1 and 80 then raise exception 'invalid_rejection_evidence'; end if;
  update public.generation_runs set rejected_output=jsonb_build_object('reason',p_reason,'payload',p_payload),usage=p_usage,model=p_usage->>'model',provider_request_id=p_usage->>'id'
    where job_id=job.id returning id into run_id;
  update public.usage_ledger set model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  return true;
end $$;
revoke all on function public.checkpoint_study_rejection(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_study_rejection(uuid,uuid,text,jsonb,jsonb) to service_role;
