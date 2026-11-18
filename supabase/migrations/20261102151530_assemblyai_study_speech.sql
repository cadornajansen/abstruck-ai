-- New narration uses AssemblyAI. Existing artifacts and historical usage remain immutable.
create or replace function public.begin_study_speech(p_job_id uuid,p_lease_token uuid,p_script_sha256 text,p_characters integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; billing jsonb; total_cost numeric; price numeric; reserved_bytes bigint; source_type text;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  billing:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() or job.kind not in ('generate_podcast','generate_video') then return null; end if;
  if coalesce(p_characters,0) not between 1 and 600 or p_script_sha256 is null or p_script_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_narration'; end if;
  if job.input->'media' is not null then
    if job.input->'media'->>'script_sha256'<>p_script_sha256 or (job.input->'media'->>'characters')::integer<>p_characters then raise exception 'narration_conflict'; end if;
    return public.get_study_media(job.id,p_lease_token)||jsonb_build_object('admitted',false);
  end if;
  if not exists(select 1 from public.generation_runs where job_id=job.id and output is not null) then raise exception 'study_text_checkpoint_missing'; end if;
  if public.billing_active_operations(owner,false)>(billing->'limits'->>'concurrentJobs')::integer then raise exception 'study_capacity_busy'; end if;
  reserved_bytes:=case when job.kind='generate_video' then 12000000 else 2000000 end;
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=owner)+reserved_bytes>(billing->'limits'->>'storageBytes')::bigint then raise exception 'storage_quota_exceeded'; end if;
  price:=round(p_characters*15.0/1000000,10);
  perform pg_advisory_xact_lock(hashtextextended('abstruck_new_study_cost',0));
  select coalesce(sum(l.reserved_cost_usd),0) into total_cost from public.usage_ledger l where l.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and
    (l.feature='study_tts' or (l.feature='study_set' and exists(select 1 from public.generation_runs r where r.id=l.id and r.operation in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart'))));
  if total_cost+price>0.10 then raise exception 'study_daily_cost_limit'; end if;
  insert into public.assets(owner_id,study_set_id,role,object_key,mime,bytes) values(owner,job.study_set_id,'study_audio',owner::text||'/study-sets/'||job.study_set_id::text||'/audio-v1.mp3','audio/mpeg',2000000);
  if job.kind='generate_video' then insert into public.assets(owner_id,study_set_id,role,object_key,mime,bytes) values(owner,job.study_set_id,'study_video',owner::text||'/study-sets/'||job.study_set_id::text||'/video-v1.mp4','video/mp4',10000000); end if;
  update public.processing_jobs set input=jsonb_set(input,'{media}',jsonb_build_object('state','submitting','script_sha256',p_script_sha256,'characters',p_characters,'provider','assemblyai','voice','aai-jane','model','assemblyai-tts-1','ratePerMillionCharacters',15,'submittedAt',now())),updated_at=now() where id=job.id;
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,units,model,reserved_cost_usd)
    values(gen_random_uuid(),owner,(billing->>'periodId')::uuid,job.id,'study_tts','reserved',p_characters,'assemblyai-tts-1',price);
  return public.get_study_media(job.id,p_lease_token)||jsonb_build_object('admitted',true);
end $$;
