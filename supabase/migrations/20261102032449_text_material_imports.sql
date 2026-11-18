alter table public.materials drop constraint materials_source_type_check;
alter table public.materials add constraint materials_source_type_check check (source_type in ('pdf','text'));
alter table public.assets add column source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$');
alter table public.source_segments add column extraction_method text not null default 'native'
  check (extraction_method in ('native','text','ocr'));
alter table public.source_segments add column extraction_status text not null default 'ready'
  check (extraction_status in ('ready','partial','unreadable'));
alter table public.source_segments add column unreadable_regions jsonb not null default '[]'::jsonb
  check (jsonb_typeof(unreadable_regions)='array' and jsonb_array_length(unreadable_regions)<=8);
update public.source_segments set extraction_status='unreadable' where btrim(text)='';

alter table public.usage_ledger add column units integer not null default 1 check (units>=0);
alter table public.usage_ledger add column processing_job_id uuid references public.processing_jobs(id) on delete set null;
create unique index usage_ledger_processing_feature_idx on public.usage_ledger(processing_job_id,feature)
  where processing_job_id is not null;

create function public.reserve_text_material(p_owner_id uuid,p_space_id uuid,p_request_id uuid,
  p_title text,p_bytes bigint,p_sha256 text,p_storage_limit bigint default 100000000)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_bytes not between 1 and 100000 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_text_source'; end if;
  select * into result from public.materials where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if result.source_type<>'text' or result.space_id is distinct from p_space_id or result.title<>p_title or not exists
      (select 1 from public.assets where material_id=result.id and bytes=p_bytes and source_sha256=p_sha256)
      then raise exception 'request_conflict'; end if;
    return result;
  end if;
  if p_space_id is not null and not exists(select 1 from public.spaces where id=p_space_id and owner_id=p_owner_id)
    then raise exception 'space_not_found'; end if;
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes>p_storage_limit
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type)
    values(p_owner_id,p_space_id,p_request_id,p_title,'text') returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes,source_sha256)
    values(result.id,p_owner_id,p_owner_id::text||'/'||result.id::text||'/original.txt','text/plain; charset=utf-8',p_bytes,p_sha256);
  return result;
end $$;

-- The profile lock serializes admissions across every job for this owner.
-- A job/feature pair reserves actual units once, including retry after a lost reply.
create function public.reserve_material_processing(p_job_id uuid,p_lease_token uuid,
  p_document_units integer,p_ocr_units integer,p_page_limit integer default 50,p_ocr_limit integer default 5)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; profile_created timestamptz; period_start timestamptz; period uuid;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  select created_at into profile_created from public.profiles where id=owner for update;
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.material_id is null or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now()
    then return false; end if;
  if p_document_units not between 1 and 200 or p_ocr_units not between 0 and p_document_units
    or p_page_limit not between 1 and 1000 or p_ocr_limit not between 0 and 100 then raise exception 'invalid_import_units'; end if;
  if exists(select 1 from public.usage_ledger where processing_job_id=job.id and
    ((feature='document_pages' and units<>p_document_units) or (feature='ocr_pages' and units<>p_ocr_units)))
    then raise exception 'import_reservation_conflict'; end if;
  if exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages' and status in ('reserved','succeeded','uncertain'))
    then return true; end if;
  period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(owner,period_start,period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into period;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='document_pages'
    and status<>'failed' and processing_job_id is distinct from job.id)+p_document_units>p_page_limit
    then raise exception 'document_page_quota_exceeded'; end if;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='ocr_pages'
    and status<>'failed' and processing_job_id is distinct from job.id)+p_ocr_units>p_ocr_limit
    then raise exception 'ocr_page_quota_exceeded'; end if;
  insert into public.usage_ledger(id,owner_id,period_id,feature,status,units,processing_job_id)
    values(gen_random_uuid(),owner,period,'document_pages','reserved',p_document_units,job.id)
    on conflict(processing_job_id,feature) where processing_job_id is not null do update
      set status='reserved',period_id=excluded.period_id,updated_at=now();
  if p_ocr_units>0 then
    insert into public.usage_ledger(id,owner_id,period_id,feature,status,units,processing_job_id)
      values(gen_random_uuid(),owner,period,'ocr_pages','reserved',p_ocr_units,job.id)
      on conflict(processing_job_id,feature) where processing_job_id is not null do update
        set status='reserved',period_id=excluded.period_id,updated_at=now();
  end if;
  return true;
end $$;

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
  update public.usage_ledger set status=case when usable_ocr>0 then 'succeeded' else 'failed' end,units=usable_ocr,updated_at=now()
    where processing_job_id=job.id and feature='ocr_pages';
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
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
  update public.usage_ledger set status='failed',updated_at=now() where processing_job_id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

revoke all on function public.reserve_text_material(uuid,uuid,uuid,text,bigint,text,bigint),
  public.reserve_material_processing(uuid,uuid,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_text_material(uuid,uuid,uuid,text,bigint,text,bigint),
  public.reserve_material_processing(uuid,uuid,integer,integer,integer,integer) to service_role;
