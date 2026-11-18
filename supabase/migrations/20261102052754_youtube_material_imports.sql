alter table public.materials drop constraint materials_source_type_check;
alter table public.materials add constraint materials_source_type_check check(source_type in ('pdf','text','docx','pptx','audio','video','youtube'));
alter table public.materials add column youtube_id text;
alter table public.materials add column source_url text;
alter table public.materials add constraint materials_youtube_source_check check(
  (source_type='youtube' and youtube_id is not null and source_url is not null and youtube_id ~ '^[A-Za-z0-9_-]{11}$' and source_url='https://www.youtube.com/watch?v='||youtube_id)
  or (source_type<>'youtube' and youtube_id is null and source_url is null)
);

create function public.reserve_youtube_material(p_owner_id uuid,p_space_id uuid,p_request_id uuid,p_video_id text)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; account jsonb;
begin
  account:=public.billing_account_context(p_owner_id);
  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'invalid_youtube_source'; end if;
  if p_space_id is not null and not exists(select 1 from public.spaces where id=p_space_id and owner_id=p_owner_id) then raise exception 'space_not_found'; end if;
  select * into result from public.materials where owner_id=p_owner_id and request_id=p_request_id for update;
  if found then
    if result.source_type<>'youtube' or result.youtube_id<>p_video_id or result.space_id is distinct from p_space_id then raise exception 'import_request_conflict'; end if;
  else
    insert into public.materials(owner_id,space_id,request_id,title,source_type,youtube_id,source_url)
      values(p_owner_id,p_space_id,p_request_id,'YouTube video','youtube',p_video_id,'https://www.youtube.com/watch?v='||p_video_id) returning * into result;
  end if;
  result:=public.queue_material(p_owner_id,result.id,true);
  update public.processing_jobs set input=jsonb_set(input,'{youtube}',
    coalesce(input->'youtube',jsonb_build_object('videoId',p_video_id,'url',result.source_url,'costLimitUsd',0.02)))
    where material_id=result.id;
  return result;
end $$;

create function public.checkpoint_youtube_metadata(p_job_id uuid,p_lease_token uuid,p_metadata jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; source public.materials; owner uuid; account jsonb; seconds integer;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  select * into source from public.materials where id=job.material_id;
  if source.source_type<>'youtube' or p_metadata->>'videoId' is distinct from source.youtube_id or p_metadata->>'url' is distinct from source.source_url or
    coalesce(length(p_metadata->>'title'),0) not between 1 and 240 or coalesce((p_metadata->>'durationSeconds')::numeric,0) not between 0.001 and 3600 or
    coalesce(p_metadata->>'extension','') not in ('m4a','webm') then raise exception 'invalid_youtube_metadata'; end if;
  seconds:=ceil((p_metadata->>'durationSeconds')::numeric)::integer;
  if seconds*0.18/3600>0.02 then raise exception 'youtube_import_cost_limit'; end if;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=(account->>'periodId')::uuid and feature='transcription_seconds'
    and status<>'failed' and processing_job_id is distinct from job.id)+seconds>(account->'limits'->>'transcriptionSeconds')::integer
    then raise exception 'transcription_quota_exceeded'; end if;
  update public.processing_jobs set input=jsonb_set(input,'{youtube}',p_metadata||jsonb_build_object('costLimitUsd',0.02,'state','metadata_verified')),updated_at=now() where id=job.id;
  update public.materials set title=p_metadata->>'title',updated_at=now() where id=source.id;
  return true;
end $$;

revoke all on function public.reserve_youtube_material(uuid,uuid,uuid,text),public.checkpoint_youtube_metadata(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_youtube_material(uuid,uuid,uuid,text),public.checkpoint_youtube_metadata(uuid,uuid,jsonb) to service_role;

create or replace function public.reserve_media_processing(p_job_id uuid,p_lease_token uuid,p_duration_ms integer,p_source_sha256 text,p_source_info jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; account jsonb; period uuid; run public.transcription_runs; seconds integer; cost numeric;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  if p_duration_ms not between 1 and 3600000 or p_source_sha256 !~ '^[a-f0-9]{64}$' or not exists
    (select 1 from public.materials where id=job.material_id and ((source_type=p_source_info->>'kind' and source_type in ('audio','video')) or (source_type='youtube' and p_source_info->>'kind'='audio')))
    then raise exception 'invalid_media_metadata'; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if found and (run.source_sha256<>p_source_sha256 or run.duration_ms<>p_duration_ms) then raise exception 'media_reservation_conflict'; end if;
  if found and run.submitted_at is not null then return to_jsonb(run); end if;
  seconds:=ceil(p_duration_ms::numeric/1000)::integer;
  cost:=round(seconds*0.18/3600,10);
  if exists(select 1 from public.materials where id=job.material_id and source_type='youtube') and cost>0.02 then raise exception 'youtube_import_cost_limit'; end if;
  period:=(account->>'periodId')::uuid;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='transcription_seconds'
    and status<>'failed' and processing_job_id is distinct from job.id)+seconds>(account->'limits'->>'transcriptionSeconds')::integer
    then raise exception 'transcription_quota_exceeded'; end if;
  perform pg_advisory_xact_lock(hashtextextended('abstruck_asr_daily_cost',0));
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where feature='transcription_seconds' and updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    and processing_job_id is distinct from job.id)+cost>1.00 then raise exception 'transcription_daily_cost_limit'; end if;
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where feature='transcription_seconds' and period_id=period and owner_id=owner
    and processing_job_id is distinct from job.id)+cost>1.00 then raise exception 'transcription_owner_cost_limit'; end if;
  insert into public.transcription_runs(job_id,owner_id,material_id,duration_ms,source_sha256,source_info,rate_usd_per_hour,request_version)
    values(job.id,owner,job.material_id,p_duration_ms,p_source_sha256,p_source_info,0.17,'media-v1-chapters-low')
    on conflict(job_id) do update set state='reserved',error_code=null,rate_usd_per_hour=excluded.rate_usd_per_hour,request_version=excluded.request_version,updated_at=now() returning * into run;
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,units,reserved_cost_usd,model)
    values(gen_random_uuid(),owner,period,job.id,'transcription_seconds','reserved',seconds,cost,'universal-2')
    on conflict(processing_job_id,feature) where processing_job_id is not null do update
      set period_id=excluded.period_id,status='reserved',units=excluded.units,reserved_cost_usd=excluded.reserved_cost_usd,updated_at=now();
  update public.assets set source_sha256=p_source_sha256 where material_id=job.material_id and role='original';
  return to_jsonb(run);
end $$;


create or replace function public.claim_material_job(p_visibility_seconds integer default 600)
returns table(job_id uuid,lease_token uuid,material_id uuid,owner_id uuid,object_key text,bytes bigint,source_type text,source_sha256 text,input jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; owner uuid; account jsonb; cached_publication boolean; media_submitted boolean;
begin
  if p_visibility_seconds not between 60 and 600 then raise exception 'invalid_visibility'; end if;
  for message in select * from pgmq.read('material_jobs',p_visibility_seconds,1) loop
    select j.owner_id into owner from public.processing_jobs j where j.id=(message.message->>'job_id')::uuid;
    if owner is null then perform pgmq.delete('material_jobs',message.msg_id); return; end if;
    account:=public.billing_account_context(owner);
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id<>message.msg_id then
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    media_submitted:=exists(select 1 from public.transcription_runs r where r.job_id=job.id and r.submitted_at is not null);
    if job.attempt>=3 and not media_submitted then
      update public.processing_jobs set state='failed',error_code='retry_limit',updated_at=now() where id=job.id;
      update public.materials set status='failed',error_code='retry_limit',updated_at=now() where id=job.material_id;
      update public.usage_ledger set status=case when reserved_cost_usd>0 then 'uncertain' else 'failed' end,updated_at=now()
        where processing_job_id=job.id;
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    -- Finishing checkpointed output needs no additional provider slot.
    cached_publication:=exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages')
      and not exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='ocr_pages'
        and units>(select count(*) from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb))));
    if not cached_publication and not media_submitted and public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
      perform pgmq.set_vt('material_jobs',message.msg_id,15); return;
    end if;
    token:=gen_random_uuid();
    job.input:=job.input||jsonb_build_object('lease_started_at',now());
    update public.processing_jobs set state='running',attempt=attempt+case when media_submitted then 0 else 1 end,lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
    update public.materials set status=case when media_submitted then 'transcribing' else 'extracting' end,updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,coalesce(a.object_key,''),coalesce(a.bytes,0::bigint),m.source_type,a.source_sha256,job.input
      from public.materials m left join public.assets a on a.material_id=m.id and a.role='original'
      where m.id=job.material_id and (m.source_type='youtube' or a.id is not null);
  end loop;
end $$;


