alter table public.usage_ledger add column reserved_cost_usd numeric(14,10) not null default 0 check (reserved_cost_usd>=0);

drop function public.claim_material_job(integer);
create function public.claim_material_job(p_visibility_seconds integer default 600)
returns table(job_id uuid,lease_token uuid,material_id uuid,owner_id uuid,object_key text,bytes bigint,source_type text,source_sha256 text,input jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid;
begin
  if p_visibility_seconds not between 60 and 600 then raise exception 'invalid_visibility'; end if;
  for message in select * from pgmq.read('material_jobs',p_visibility_seconds,1) loop
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id<>message.msg_id then
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    if job.attempt>=3 then
      update public.processing_jobs set state='failed',error_code='retry_limit',updated_at=now() where id=job.id;
      update public.materials set status='failed',error_code='retry_limit',updated_at=now() where id=job.material_id;
      update public.usage_ledger set status=case when reserved_cost_usd>0 then 'uncertain' else 'failed' end,updated_at=now()
        where processing_job_id=job.id;
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    token:=gen_random_uuid();
    job.input:=job.input||jsonb_build_object('lease_started_at',now());
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
    update public.materials set status='extracting',updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,a.object_key,a.bytes,m.source_type,a.source_sha256,job.input
      from public.assets a join public.materials m on m.id=a.material_id where a.material_id=job.material_id and a.role='original';
  end loop;
end $$;

create function public.renew_material_job(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now()
    or (job.input->>'lease_started_at')::timestamptz<now()-interval '30 minutes' then return false; end if;
  perform pgmq.set_vt('material_jobs',job.message_id,600);
  update public.processing_jobs set lease_until=now()+interval '600 seconds',updated_at=now() where id=job.id;
  return true;
end $$;

-- Reserve a bounded page call before submission. An existing submitted page is
-- returned unchanged: a lost provider response can never silently spend again.
create function public.begin_material_ocr_page(p_job_id uuid,p_lease_token uuid,p_page integer,
  p_input_tokens integer,p_reserved_usd numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; ledger public.usage_ledger; existing jsonb; entry jsonb; global_reserved numeric;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  perform 1 from public.profiles where id=owner for update;
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  existing:=job.input->'ocr'->p_page::text;
  if existing is not null then return existing; end if;
  select * into ledger from public.usage_ledger where processing_job_id=job.id and feature='ocr_pages' for update;
  if not found or ledger.status not in ('reserved','uncertain') then raise exception 'ocr_reservation_missing'; end if;
  if p_page not between 1 and 200 or p_input_tokens not between 1 and 32768 or p_reserved_usd is null or
    p_reserved_usd<>round((p_input_tokens*0.125+4096*0.50)/1000000,10) then raise exception 'invalid_ocr_cost'; end if;
  if (select count(*) from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb)))>=ledger.units then raise exception 'ocr_call_limit'; end if;
  if ledger.reserved_cost_usd+p_reserved_usd>0.04 then raise exception 'ocr_job_cost_limit'; end if;
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where owner_id=owner and period_id=ledger.period_id and feature='ocr_pages')+p_reserved_usd>0.10
    then raise exception 'ocr_owner_cost_limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended('abstruck_ocr_daily_cost',0));
  -- Counting a prior-day job touched today again is conservative; deleted source
  -- jobs retain their ledger expenditure and cannot reset the global budget.
  select coalesce(sum(reserved_cost_usd),0) into global_reserved from public.usage_ledger
    where feature='ocr_pages' and updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if global_reserved+p_reserved_usd>1.00 then raise exception 'ocr_daily_cost_limit'; end if;
  entry:=jsonb_build_object('state','submitted','submitted_at',now(),'reserved_usd',p_reserved_usd,'input_tokens',p_input_tokens);
  update public.processing_jobs set input=jsonb_set(input,'{ocr}',coalesce(input->'ocr','{}'::jsonb)||jsonb_build_object(p_page::text,entry)),updated_at=now() where id=job.id;
  update public.usage_ledger set reserved_cost_usd=reserved_cost_usd+p_reserved_usd,model='gpt-6-luna',updated_at=now() where id=ledger.id;
  return entry||jsonb_build_object('admitted',true);
end $$;

create function public.checkpoint_material_ocr_page(p_job_id uuid,p_lease_token uuid,p_page integer,p_output jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; entry jsonb; ocr jsonb;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  entry:=job.input->'ocr'->p_page::text;
  if entry is null then raise exception 'ocr_submission_missing'; end if;
  if entry->>'state' in ('saved','uncertain') then return true; end if;
  if jsonb_typeof(p_output)<>'object' or (p_output->>'pageNumber')::integer<>p_page or
    p_output->>'status' not in ('ready','partial','unreadable') or octet_length(p_output::text)>131072
    then raise exception 'invalid_ocr_checkpoint'; end if;
  if p_usage is not null and (p_usage->>'model'<>'gpt-6-luna' or (p_usage->>'input_tokens')::integer>(entry->>'input_tokens')::integer or
    (p_usage->>'output_tokens')::integer>4096 or (p_usage->>'cost_usd')::numeric>(entry->>'reserved_usd')::numeric)
    then raise exception 'ocr_usage_overrun'; end if;
  entry:=entry||jsonb_build_object('state',case when p_usage is null then 'uncertain' else 'saved' end,'output',p_output,'usage',p_usage);
  ocr:=coalesce(job.input->'ocr','{}'::jsonb)||jsonb_build_object(p_page::text,entry);
  update public.processing_jobs set input=jsonb_set(input,'{ocr}',ocr),updated_at=now() where id=job.id;
  update public.usage_ledger set
    input_tokens=(select coalesce(sum((p.value->'usage'->>'input_tokens')::integer),0) from jsonb_each(ocr) p),
    output_tokens=(select coalesce(sum((p.value->'usage'->>'output_tokens')::integer),0) from jsonb_each(ocr) p),
    cost_usd=(select coalesce(sum((p.value->'usage'->>'cost_usd')::numeric),0) from jsonb_each(ocr) p),
    provider_response_id=coalesce(p_usage->>'id',provider_response_id),updated_at=now()
    where processing_job_id=job.id and feature='ocr_pages';
  return true;
end $$;

create or replace function public.fail_material_job(p_job_id uuid,p_lease_token uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  update public.materials set status='failed',error_code=left(p_error,80),updated_at=now() where id=job.material_id;
  update public.usage_ledger set status=case when feature='ocr_pages' and exists
    (select 1 from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb)) p where p.value->>'state' in ('submitted','uncertain'))
    then 'uncertain' else 'failed' end,updated_at=now() where processing_job_id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

revoke all on function public.claim_material_job(integer),public.renew_material_job(uuid,uuid),
  public.begin_material_ocr_page(uuid,uuid,integer,integer,numeric),public.checkpoint_material_ocr_page(uuid,uuid,integer,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.claim_material_job(integer),public.renew_material_job(uuid,uuid),
  public.begin_material_ocr_page(uuid,uuid,integer,integer,numeric),public.checkpoint_material_ocr_page(uuid,uuid,integer,jsonb,jsonb)
  to service_role;

create or replace function public.finish_material_job(p_job_id uuid,p_lease_token uuid,p_segments jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; source public.materials; segment record; usable integer; usable_ocr integer;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  if jsonb_typeof(p_segments)<>'array' or jsonb_array_length(p_segments) not between 1 and 200 then raise exception 'invalid_segments'; end if;
  select * into source from public.materials where id=job.material_id for update;
  if not exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages' and status='reserved')
    then raise exception 'import_reservation_missing'; end if;
  for segment in select value,ordinality from jsonb_array_elements(p_segments) with ordinality loop
    if (segment.value->>'ordinal')::integer<>segment.ordinality or
      (source.source_type='text' and (segment.value->'locator'->>'type'<>'paragraph' or
        (segment.value->'locator'->>'paragraph')::integer<>segment.ordinality or segment.value->>'extraction_method'<>'text')) or
      (source.source_type='pdf' and (segment.value->'locator'->>'type'<>'page' or
        (segment.value->'locator'->>'page')::integer<>segment.ordinality or segment.value->>'extraction_method' not in ('native','ocr')))
      then raise exception 'invalid_source_locator'; end if;
    if segment.value->>'extraction_status'='ready' and btrim(segment.value->>'text')='' then raise exception 'invalid_readable_segment'; end if;
  end loop;
  insert into public.source_segments(material_id,owner_id,extraction_version,ordinal,locator,text,extraction_method,extraction_status,unreadable_regions)
    select job.material_id,job.owner_id,source.extraction_version,s.ordinal,s.locator,s.text,s.extraction_method,s.extraction_status,s.unreadable_regions
    from jsonb_to_recordset(p_segments) as s(ordinal integer,locator jsonb,text text,extraction_method text,extraction_status text,unreadable_regions jsonb);
  select count(*) filter(where extraction_status<>'unreadable'),
    count(*) filter(where extraction_method='ocr' and extraction_status<>'unreadable') into usable,usable_ocr
    from public.source_segments where material_id=source.id and extraction_version=source.extraction_version;
  update public.materials set status=case when exists(select 1 from public.source_segments
    where material_id=source.id and extraction_version=source.extraction_version and extraction_status<>'ready') then 'partial' else 'ready' end,
    error_code=null,updated_at=now() where id=source.id;
  update public.usage_ledger set status=case when usable>0 then 'succeeded' else 'failed' end,
    units=case when source.source_type='text' then units else usable end,updated_at=now()
    where processing_job_id=job.id and feature='document_pages';
  update public.usage_ledger set status=case when exists(select 1 from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb)) p
    where p.value->>'state' in ('submitted','uncertain')) then 'uncertain' when usable_ocr>0 then 'succeeded' else 'failed' end,
    units=usable_ocr,updated_at=now() where processing_job_id=job.id and feature='ocr_pages';
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;
