-- Current pricing is STT $0.15/hr + low-effort chapters $0.02/hr.
-- Reserve $0.18/hr because the migration guide still quotes $0.03/hr for summaries.
alter table public.transcription_runs add column rate_usd_per_hour numeric(8,4) not null default 0.15;
alter table public.transcription_runs alter column rate_usd_per_hour set default 0.17;
alter table public.transcription_runs add column request_version text not null default 'media-v1-transcript';
alter table public.transcription_runs alter column request_version set default 'media-v1-chapters-low';

create or replace function public.reserve_media_processing(p_job_id uuid,p_lease_token uuid,p_duration_ms integer,p_source_sha256 text,p_source_info jsonb)
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
  cost:=round(seconds*0.18/3600,10);
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

