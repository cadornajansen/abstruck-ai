alter table public.materials drop constraint materials_source_type_check;
alter table public.materials add constraint materials_source_type_check check(source_type in ('pdf','text','docx','pptx','audio','video'));
alter table public.materials drop constraint materials_status_check;
alter table public.materials add constraint materials_status_check check(status in ('awaiting_upload','queued','extracting','transcribing','ready','partial','failed'));
alter table public.assets drop constraint assets_role_check;
alter table public.assets add constraint assets_role_check check(role in ('original','normalized_pdf','normalized_audio'));
alter table public.processing_jobs drop constraint processing_jobs_state_check;
alter table public.processing_jobs add constraint processing_jobs_state_check check(state in ('queued','running','waiting_provider','succeeded','failed'));
alter table public.source_segments drop constraint source_segments_extraction_method_check;
alter table public.source_segments add constraint source_segments_extraction_method_check check(extraction_method in ('native','text','ocr','transcript'));

create table public.transcription_runs (
  job_id uuid primary key references public.processing_jobs(id) on delete cascade,
  material_id uuid not null unique,
  owner_id uuid not null,
  state text not null default 'reserved' check(state in ('reserved','submitting','processing','completed','error','uncertain')),
  duration_ms integer not null check(duration_ms between 1 and 3600000),
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_info jsonb not null,
  audio_asset jsonb,
  provider_id text unique,
  provider_audio_url text,
  submitted_at timestamptz,
  poll_count integer not null default 0,
  output jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(material_id,owner_id) references public.materials(id,owner_id) on delete cascade
);
create index transcription_runs_owner_idx on public.transcription_runs(owner_id);
create table public.transcription_callbacks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.transcription_runs(job_id) on delete cascade,
  provider_id text not null,
  status text not null check(status in ('completed','error')),
  received_at timestamptz not null default now(),
  unique(job_id,provider_id,status)
);
alter table public.transcription_runs enable row level security;
alter table public.transcription_callbacks enable row level security;
create policy transcription_runs_read_own on public.transcription_runs for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.transcription_runs,public.transcription_callbacks from anon,authenticated;
grant select on public.transcription_runs to authenticated;
grant all on public.transcription_runs,public.transcription_callbacks to service_role;

create function public.reserve_media_material_upload(p_owner_id uuid,p_space_id uuid,p_request_id uuid,p_title text,p_bytes bigint,p_extension text)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; account jsonb; kind text; source_mime text;
begin
  account:=public.billing_account_context(p_owner_id);
  if p_extension not in ('mp3','m4a','wav','ogg','mp4','mov','webm') or p_bytes not between 1 and 25000000 then raise exception 'invalid_media_source'; end if;
  kind:=case when p_extension in ('mp4','mov','webm') then 'video' else 'audio' end;
  source_mime:=case p_extension when 'mp3' then 'audio/mpeg' when 'm4a' then 'audio/mp4' when 'wav' then 'audio/wav'
    when 'ogg' then 'audio/ogg' when 'mp4' then 'video/mp4' when 'mov' then 'video/quicktime' else 'video/webm' end;
  select * into result from public.materials where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if result.source_type<>kind or result.title<>p_title or result.space_id is distinct from p_space_id or not exists
      (select 1 from public.assets a where a.material_id=result.id and a.role='original' and a.bytes=p_bytes and a.mime=source_mime)
      then raise exception 'request_conflict'; end if;
    return result;
  end if;
  if p_space_id is not null and not exists(select 1 from public.spaces where id=p_space_id and owner_id=p_owner_id) then raise exception 'space_not_found'; end if;
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes>(account->'limits'->>'storageBytes')::bigint
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type) values(p_owner_id,p_space_id,p_request_id,p_title,kind) returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes) values(result.id,p_owner_id,
    p_owner_id::text||'/'||result.id::text||'/original.'||p_extension,source_mime,p_bytes);
  return result;
end $$;

create function public.get_media_run(p_job_id uuid,p_lease_token uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select to_jsonb(r) from public.transcription_runs r join public.processing_jobs j on j.id=r.job_id
    where j.id=p_job_id and j.state='running' and j.lease_token=p_lease_token and j.lease_until>now();
$$;

create function public.reserve_media_processing(p_job_id uuid,p_lease_token uuid,p_duration_ms integer,p_source_sha256 text,p_source_info jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; account jsonb; period uuid; run public.transcription_runs; seconds integer; cost numeric;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  if p_duration_ms not between 1 and 3600000 or p_source_sha256 !~ '^[a-f0-9]{64}$' or not exists
    (select 1 from public.materials where id=job.material_id and source_type=p_source_info->>'kind' and source_type in ('audio','video'))
    then raise exception 'invalid_media_metadata'; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if found and (run.source_sha256<>p_source_sha256 or run.duration_ms<>p_duration_ms) then raise exception 'media_reservation_conflict'; end if;
  if found and run.submitted_at is not null then return to_jsonb(run); end if;
  seconds:=ceil(p_duration_ms::numeric/1000)::integer;
  cost:=round(seconds*0.15/3600,10);
  period:=(account->>'periodId')::uuid;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='transcription_seconds'
    and status<>'failed' and processing_job_id is distinct from job.id)+seconds>(account->'limits'->>'transcriptionSeconds')::integer
    then raise exception 'transcription_quota_exceeded'; end if;
  perform pg_advisory_xact_lock(hashtextextended('abstruck_asr_daily_cost',0));
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where feature='transcription_seconds' and updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    and processing_job_id is distinct from job.id)+cost>1.00 then raise exception 'transcription_daily_cost_limit'; end if;
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where feature='transcription_seconds' and period_id=period and owner_id=owner
    and processing_job_id is distinct from job.id)+cost>1.00 then raise exception 'transcription_owner_cost_limit'; end if;
  insert into public.transcription_runs(job_id,owner_id,material_id,duration_ms,source_sha256,source_info)
    values(job.id,owner,job.material_id,p_duration_ms,p_source_sha256,p_source_info)
    on conflict(job_id) do update set state='reserved',error_code=null,updated_at=now() returning * into run;
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,units,reserved_cost_usd,model)
    values(gen_random_uuid(),owner,period,job.id,'transcription_seconds','reserved',seconds,cost,'universal-2')
    on conflict(processing_job_id,feature) where processing_job_id is not null do update
      set period_id=excluded.period_id,status='reserved',units=excluded.units,reserved_cost_usd=excluded.reserved_cost_usd,updated_at=now();
  update public.assets set source_sha256=p_source_sha256 where material_id=job.material_id and role='original';
  return to_jsonb(run);
end $$;

create function public.reserve_normalized_audio(p_job_id uuid,p_lease_token uuid,p_bytes bigint,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; account jsonb; asset public.assets; result jsonb;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  if p_bytes not between 1 and 50000000 or p_sha256 !~ '^[a-f0-9]{64}$' or not exists(select 1 from public.transcription_runs where job_id=job.id)
    then raise exception 'invalid_normalized_audio'; end if;
  select * into asset from public.assets where material_id=job.material_id and role='normalized_audio' for update;
  if not found or asset.uploaded_at is null then
    if (select coalesce(sum(bytes),0) from public.assets where owner_id=owner and id is distinct from asset.id)+p_bytes>(account->'limits'->>'storageBytes')::bigint
      then raise exception 'storage_quota_exceeded'; end if;
    insert into public.assets(material_id,owner_id,role,object_key,mime,bytes,source_sha256)
      values(job.material_id,owner,'normalized_audio',owner::text||'/'||job.material_id::text||'/audio-v1.mp3','audio/mpeg',p_bytes,p_sha256)
      on conflict(material_id,role) do update set bytes=excluded.bytes,source_sha256=excluded.source_sha256 returning * into asset;
  end if;
  result:=jsonb_build_object('object_key',asset.object_key,'bytes',asset.bytes,'sha256',asset.source_sha256,'uploaded',asset.uploaded_at is not null);
  update public.transcription_runs set audio_asset=result,updated_at=now() where job_id=job.id;
  return result;
end $$;

create function public.confirm_normalized_audio(p_job_id uuid,p_lease_token uuid,p_sha256 text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.assets set uploaded_at=coalesce(uploaded_at,now()) where material_id=job.material_id and role='normalized_audio' and source_sha256=p_sha256;
  if not found then raise exception 'normalized_audio_mismatch'; end if;
  update public.transcription_runs set audio_asset=jsonb_set(audio_asset,'{uploaded}','true'::jsonb),updated_at=now() where job_id=job.id;
  return true;
end $$;

revoke all on function public.reserve_media_material_upload(uuid,uuid,uuid,text,bigint,text),public.get_media_run(uuid,uuid),
  public.reserve_media_processing(uuid,uuid,integer,text,jsonb),public.reserve_normalized_audio(uuid,uuid,bigint,text),public.confirm_normalized_audio(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.reserve_media_material_upload(uuid,uuid,uuid,text,bigint,text),public.get_media_run(uuid,uuid),
  public.reserve_media_processing(uuid,uuid,integer,text,jsonb),public.reserve_normalized_audio(uuid,uuid,bigint,text),public.confirm_normalized_audio(uuid,uuid,text)
  to service_role;

create function public.begin_media_transcription(p_job_id uuid,p_lease_token uuid,p_audio_url text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if not found or run.audio_asset->>'uploaded'<>'true' then raise exception 'normalized_audio_missing'; end if;
  if run.submitted_at is not null then return to_jsonb(run); end if;
  if length(p_audio_url)>4096 or p_audio_url not like 'https://%.r2.cloudflarestorage.com/%' then raise exception 'invalid_provider_source'; end if;
  update public.transcription_runs set state='submitting',provider_audio_url=p_audio_url,submitted_at=now(),updated_at=now()
    where job_id=job.id returning * into run;
  return to_jsonb(run)||jsonb_build_object('admitted',true);
end $$;

create function public.wait_media_transcription(p_job_id uuid,p_lease_token uuid,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if run.submitted_at is null then raise exception 'transcript_not_submitted'; end if;
  if p_provider_id is not null and (p_provider_id !~ '^[a-fA-F0-9-]{36}$' or
    (run.provider_id is not null and run.provider_id<>p_provider_id)) then raise exception 'transcript_identity_conflict'; end if;
  update public.transcription_runs set provider_id=coalesce(provider_id,p_provider_id),
    state=case when coalesce(provider_id,p_provider_id) is null then 'uncertain' else 'processing' end,
    poll_count=poll_count+1,updated_at=now() where job_id=job.id;
  update public.processing_jobs set state='waiting_provider',lease_until=null,updated_at=now() where id=job.id;
  update public.materials set status='transcribing',updated_at=now() where id=job.material_id;
  perform pgmq.set_vt('material_jobs',job.message_id,case when exists
    (select 1 from public.transcription_callbacks where job_id=job.id) then 0 else 30 end);
  return true;
end $$;

create function public.record_media_callback(p_job_id uuid,p_provider_id text,p_status text,p_audio_url text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs; msg bigint;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found then return false; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if not found or run.submitted_at is null or run.provider_audio_url<>p_audio_url or p_status not in ('completed','error') or
    (run.provider_id is not null and run.provider_id<>p_provider_id) then return false; end if;
  insert into public.transcription_callbacks(job_id,provider_id,status) values(job.id,p_provider_id,p_status) on conflict do nothing;
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

create function public.checkpoint_media_output(p_job_id uuid,p_lease_token uuid,p_output jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs; reserved_units integer; reserved_cost numeric;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if run.provider_id is null then raise exception 'transcript_identity_missing'; end if;
  if run.output is not null then return true; end if;
  select units,reserved_cost_usd into reserved_units,reserved_cost from public.usage_ledger where processing_job_id=job.id and feature='transcription_seconds';
  if jsonb_typeof(p_output->'segments')<>'array' or jsonb_array_length(p_output->'segments') not between 1 and 1000 or
    octet_length(p_output::text)>2000000 or (p_output->>'providerSeconds')::integer not between 1 and reserved_units or
    (p_output->>'costUsd')::numeric>reserved_cost then raise exception 'invalid_transcript_output'; end if;
  update public.transcription_runs set output=p_output,state='completed',updated_at=now() where job_id=job.id;
  update public.usage_ledger set provider_response_id=run.provider_id,cost_usd=(p_output->>'costUsd')::numeric,updated_at=now()
    where processing_job_id=job.id and feature='transcription_seconds';
  return true;
end $$;

create function public.finish_media_job(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.transcription_runs; source public.materials; segment record;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  select * into run from public.transcription_runs where job_id=job.id for update;
  if run.output is null then raise exception 'transcript_output_missing'; end if;
  select * into source from public.materials where id=job.material_id for update;
  for segment in select value,ordinality from jsonb_array_elements(run.output->'segments') with ordinality loop
    if (segment.value->>'ordinal')::integer<>segment.ordinality or segment.value->'locator'->>'type'<>'time' or
      (segment.value->'locator'->>'start_ms')::integer<0 or (segment.value->'locator'->>'end_ms')::integer<(segment.value->'locator'->>'start_ms')::integer or
      (segment.value->'locator'->>'end_ms')::integer>run.duration_ms+1000 or length(segment.value->>'text') not between 1 and 2000
      then raise exception 'invalid_transcript_segment'; end if;
  end loop;
  insert into public.source_segments(material_id,owner_id,extraction_version,ordinal,locator,text,extraction_method,extraction_status)
    select job.material_id,job.owner_id,source.extraction_version,s.ordinal,s.locator,s.text,'transcript','ready'
      from jsonb_to_recordset(run.output->'segments') as s(ordinal integer,locator jsonb,text text);
  update public.usage_ledger set status='succeeded',units=(run.output->>'providerSeconds')::integer,cost_usd=(run.output->>'costUsd')::numeric,
    provider_response_id=run.provider_id,updated_at=now() where processing_job_id=job.id and feature='transcription_seconds';
  update public.materials set status='ready',error_code=null,updated_at=now() where id=job.material_id;
  update public.processing_jobs set state='succeeded',lease_until=null,error_code=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

create function public.fail_media_job(p_job_id uuid,p_lease_token uuid,p_error text,p_uncertain boolean,p_cost_usd numeric default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.transcription_runs set state=case when p_uncertain then 'uncertain' else 'error' end,error_code=left(p_error,80),updated_at=now() where job_id=job.id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,cost_usd=coalesce(p_cost_usd,cost_usd),
    updated_at=now() where processing_job_id=job.id and feature='transcription_seconds';
  update public.materials set status='failed',error_code=left(p_error,80),updated_at=now() where id=job.material_id;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

revoke all on function public.begin_media_transcription(uuid,uuid,text),public.wait_media_transcription(uuid,uuid,text),
  public.record_media_callback(uuid,text,text,text),public.checkpoint_media_output(uuid,uuid,jsonb),public.finish_media_job(uuid,uuid),public.fail_media_job(uuid,uuid,text,boolean,numeric)
  from public,anon,authenticated;
grant execute on function public.begin_media_transcription(uuid,uuid,text),public.wait_media_transcription(uuid,uuid,text),
  public.record_media_callback(uuid,text,text,text),public.checkpoint_media_output(uuid,uuid,jsonb),public.finish_media_job(uuid,uuid),public.fail_media_job(uuid,uuid,text,boolean,numeric)
  to service_role;

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
    media_submitted:=exists(select 1 from public.transcription_runs where job_id=job.id and submitted_at is not null);
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
    return query select job.id,token,job.material_id,job.owner_id,a.object_key,a.bytes,m.source_type,a.source_sha256,job.input
      from public.assets a join public.materials m on m.id=a.material_id where a.material_id=job.material_id and a.role='original';
  end loop;
end $$;

