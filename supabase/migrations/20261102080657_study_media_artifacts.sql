create function public.renew_study_output_job(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; deadline timestamptz;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() or job.kind not in ('generate_podcast','generate_video') then return false; end if;
  select vt into deadline from pgmq.set_vt('study_jobs',job.message_id,600);
  update public.processing_jobs set lease_until=deadline,updated_at=now() where id=job.id;
  return true;
end $$;

create function public.get_study_media(p_job_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; audio public.assets; video public.assets;
begin
  select * into job from public.processing_jobs where id=p_job_id and state='running' and lease_token=p_lease_token and lease_until>now();
  if not found or job.input->'media' is null then return null; end if;
  select * into audio from public.assets where study_set_id=job.study_set_id and role='study_audio';
  select * into video from public.assets where study_set_id=job.study_set_id and role='study_video';
  return (job.input->'media')||jsonb_build_object('audio',jsonb_build_object('id',audio.id,'object_key',audio.object_key,'bytes',audio.bytes,'sha256',audio.source_sha256,'uploaded',audio.uploaded_at is not null),
    'video',case when video.id is null then null else jsonb_build_object('id',video.id,'object_key',video.object_key,'bytes',video.bytes,'sha256',video.source_sha256,'uploaded',video.uploaded_at is not null) end);
end $$;

create function public.begin_study_speech(p_job_id uuid,p_lease_token uuid,p_script_sha256 text,p_characters integer)
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
  update public.processing_jobs set input=jsonb_set(input,'{media}',jsonb_build_object('state','submitting','script_sha256',p_script_sha256,'characters',p_characters,'model','tts-1','ratePerMillionCharacters',15,'submittedAt',now())),updated_at=now() where id=job.id;
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,units,model,reserved_cost_usd)
    values(gen_random_uuid(),owner,(billing->>'periodId')::uuid,job.id,'study_tts','reserved',p_characters,'tts-1',price);
  return public.get_study_media(job.id,p_lease_token)||jsonb_build_object('admitted',true);
end $$;

create function public.checkpoint_study_artifact(p_job_id uuid,p_lease_token uuid,p_role text,p_bytes bigint,p_sha256 text,p_duration_ms integer,p_provider_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; asset public.assets;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  if p_role not in ('study_audio','study_video') or p_bytes not between 1 and (case when p_role='study_audio' then 2000000 else 10000000 end) or
    p_duration_ms not between 1 and 120000 or p_sha256 !~ '^[a-f0-9]{64}$' or length(p_provider_id)>200 then raise exception 'invalid_study_artifact'; end if;
  select * into asset from public.assets where study_set_id=job.study_set_id and owner_id=job.owner_id and role=p_role for update;
  if not found or job.input->'media' is null then raise exception 'study_artifact_not_reserved'; end if;
  if asset.uploaded_at is not null and (asset.source_sha256<>p_sha256 or asset.bytes<>p_bytes or (asset.metadata->>'durationMs')::integer<>p_duration_ms) then raise exception 'study_artifact_immutable'; end if;
  update public.assets set bytes=p_bytes,source_sha256=p_sha256,uploaded_at=coalesce(uploaded_at,now()),metadata=jsonb_build_object('durationMs',p_duration_ms,'scriptSha256',job.input->'media'->>'script_sha256','providerId',p_provider_id,'aiVoice',true) where id=asset.id;
  update public.processing_jobs set input=jsonb_set(input,'{media,state}',to_jsonb(case when p_role='study_audio' then 'audio_ready'::text else 'video_ready'::text end)),updated_at=now() where id=job.id;
  if p_role='study_audio' then update public.usage_ledger set status='succeeded',cost_usd=reserved_cost_usd,provider_response_id=nullif(p_provider_id,''),updated_at=now() where processing_job_id=job.id and feature='study_tts'; end if;
  return true;
end $$;

create function public.fail_study_speech(p_job_id uuid,p_lease_token uuid,p_uncertain boolean,p_error text,p_cost_usd numeric default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.processing_jobs set input=jsonb_set(input,'{media,state}',to_jsonb(case when p_uncertain then 'uncertain'::text else 'error'::text end)),updated_at=now() where id=job.id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,cost_usd=p_cost_usd,
    reserved_cost_usd=case when not p_uncertain and coalesce(p_cost_usd,0)=0 then 0 else reserved_cost_usd end,updated_at=now() where processing_job_id=job.id and feature='study_tts';
  return true;
end $$;

revoke all on function public.renew_study_output_job(uuid,uuid),public.get_study_media(uuid,uuid),public.begin_study_speech(uuid,uuid,text,integer),
  public.checkpoint_study_artifact(uuid,uuid,text,bigint,text,integer,text),public.fail_study_speech(uuid,uuid,boolean,text,numeric) from public,anon,authenticated;
grant execute on function public.renew_study_output_job(uuid,uuid),public.get_study_media(uuid,uuid),public.begin_study_speech(uuid,uuid,text,integer),
  public.checkpoint_study_artifact(uuid,uuid,text,bigint,text,integer,text),public.fail_study_speech(uuid,uuid,boolean,text,numeric) to service_role;
