create or replace function public.record_media_callback(p_job_id uuid,p_provider_id text,p_status text,p_audio_url text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs; msg bigint;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found then return false; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if not found or run.submitted_at is null or run.provider_audio_url<>p_audio_url or p_status not in ('completed','error') or
    (run.provider_id is not null and run.provider_id<>p_provider_id) then return false; end if;
  insert into public.transcription_callbacks(job_id,provider_id,status) values(job.id,p_provider_id,p_status) on conflict do nothing;
  if not found then return true; end if;
  update public.transcription_runs set provider_id=p_provider_id,poll_count=least(poll_count,119),updated_at=now() where job_id=job.id;
  if job.state='waiting_provider' then
    perform pgmq.set_vt('material_jobs',job.message_id,0);
  elsif job.state='failed' and p_status='completed' and run.output is null then
    select pgmq.send('material_jobs',jsonb_build_object('job_id',job.id)) into msg;
    update public.processing_jobs set state='waiting_provider',message_id=msg,error_code=null,updated_at=now() where id=job.id;
    update public.materials set status='transcribing',error_code=null,updated_at=now() where id=job.material_id;
  end if;
  return true;
end $$;

