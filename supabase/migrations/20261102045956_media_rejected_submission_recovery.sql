create or replace function public.fail_media_job(p_job_id uuid,p_lease_token uuid,p_error text,p_uncertain boolean,p_cost_usd numeric default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  if p_error='transcript_submission_rejected' and not p_uncertain then
    update public.transcription_runs set submitted_at=null,provider_audio_url=null where job_id=job.id and provider_id is null;
    if not found then p_uncertain:=true; end if;
  end if;
  update public.transcription_runs set state=case when p_uncertain then 'uncertain' else 'error' end,error_code=left(p_error,80),updated_at=now() where job_id=job.id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,cost_usd=coalesce(p_cost_usd,cost_usd),reserved_cost_usd=case when p_error='transcript_submission_rejected' and not p_uncertain then 0 else reserved_cost_usd end,
    updated_at=now() where processing_job_id=job.id and feature='transcription_seconds';
  update public.materials set status='failed',error_code=left(p_error,80),updated_at=now() where id=job.material_id;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

