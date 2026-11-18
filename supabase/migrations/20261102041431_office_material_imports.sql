alter table public.materials drop constraint materials_source_type_check;
alter table public.materials add constraint materials_source_type_check check(source_type in ('pdf','text','docx','pptx'));
alter table public.assets drop constraint assets_role_check;
alter table public.assets add constraint assets_role_check check(role in ('original','normalized_pdf'));
alter table public.assets drop constraint assets_bytes_check;
alter table public.assets add constraint assets_bytes_check check(bytes>=1 and bytes<=case when role='original' then 25000000 else 50000000 end);

create function public.reserve_office_material_upload(p_owner_id uuid,p_space_id uuid,p_request_id uuid,
  p_title text,p_bytes bigint,p_source_type text,p_storage_limit bigint default 100000000)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_source_type not in ('docx','pptx') or p_bytes not between 1 and 25000000 then raise exception 'invalid_office_source'; end if;
  select * into result from public.materials where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if result.source_type<>p_source_type or result.space_id is distinct from p_space_id or result.title<>p_title or
      not exists(select 1 from public.assets where material_id=result.id and role='original' and bytes=p_bytes)
      then raise exception 'request_conflict'; end if;
    return result;
  end if;
  if p_space_id is not null and not exists(select 1 from public.spaces where id=p_space_id and owner_id=p_owner_id)
    then raise exception 'space_not_found'; end if;
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes>p_storage_limit
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type) values(p_owner_id,p_space_id,p_request_id,p_title,p_source_type) returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes) values(result.id,p_owner_id,
    p_owner_id::text||'/'||result.id::text||'/original.'||p_source_type,
    case when p_source_type='docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else 'application/vnd.openxmlformats-officedocument.presentationml.presentation' end,p_bytes);
  return result;
end $$;

create function public.reserve_normalized_pdf(p_job_id uuid,p_lease_token uuid,p_bytes bigint,p_sha256 text,p_storage_limit bigint default 100000000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; asset public.assets; source public.materials; result jsonb;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  perform 1 from public.profiles where id=owner for update;
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  select * into source from public.materials where id=job.material_id and source_type in ('docx','pptx');
  if not found then raise exception 'office_source_required'; end if;
  if p_bytes not between 1 and 50000000 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_normalized_pdf'; end if;
  select * into asset from public.assets where material_id=source.id and role='normalized_pdf' for update;
  if not found or asset.uploaded_at is null then
    if (select coalesce(sum(bytes),0) from public.assets where owner_id=owner and id is distinct from asset.id)+p_bytes>p_storage_limit
      then raise exception 'storage_quota_exceeded'; end if;
    insert into public.assets(material_id,owner_id,role,object_key,mime,bytes,source_sha256)
      values(source.id,owner,'normalized_pdf',owner::text||'/'||source.id::text||'/normalized-v'||source.extraction_version::text||'.pdf','application/pdf',p_bytes,p_sha256)
      on conflict(material_id,role) do update set bytes=excluded.bytes,source_sha256=excluded.source_sha256 returning * into asset;
  end if;
  result:=jsonb_build_object('object_key',asset.object_key,'bytes',asset.bytes,'sha256',asset.source_sha256,'uploaded',asset.uploaded_at is not null);
  update public.processing_jobs set input=jsonb_set(input,'{normalized_pdf}',result),updated_at=now() where id=job.id;
  return result;
end $$;

create function public.confirm_normalized_pdf(p_job_id uuid,p_lease_token uuid,p_sha256 text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.assets set uploaded_at=coalesce(uploaded_at,now()) where material_id=job.material_id and role='normalized_pdf' and source_sha256=p_sha256;
  if not found then raise exception 'normalized_pdf_mismatch'; end if;
  update public.processing_jobs set input=jsonb_set(input,'{normalized_pdf,uploaded}','true'::jsonb),updated_at=now() where id=job.id;
  return true;
end $$;

revoke all on function public.reserve_office_material_upload(uuid,uuid,uuid,text,bigint,text,bigint),
  public.reserve_normalized_pdf(uuid,uuid,bigint,text,bigint),public.confirm_normalized_pdf(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_office_material_upload(uuid,uuid,uuid,text,bigint,text,bigint),
  public.reserve_normalized_pdf(uuid,uuid,bigint,text,bigint),public.confirm_normalized_pdf(uuid,uuid,text) to service_role;

create or replace function public.queue_material(p_owner_id uuid,p_material_id uuid,p_retry boolean default false)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; job_id uuid; msg_id bigint;
begin
  select * into result from public.materials where id=p_material_id and owner_id=p_owner_id for update;
  if not found then raise exception 'material_not_found'; end if;
  if result.status<>'awaiting_upload' and not(p_retry and result.status='failed') then return result; end if;
  update public.assets set uploaded_at=coalesce(uploaded_at,now()) where material_id=result.id and role='original';
  insert into public.processing_jobs(material_id,owner_id) values(result.id,p_owner_id)
    on conflict(material_id) do update set state='queued',attempt=0,error_code=null,lease_token=null,lease_until=null,updated_at=now()
    returning id into job_id;
  select pgmq.send('material_jobs',jsonb_build_object('job_id',job_id)) into msg_id;
  update public.processing_jobs set message_id=msg_id where id=job_id;
  update public.materials set status='queued',error_code=null,updated_at=now() where id=result.id returning * into result;
  return result;
end $$;

create or replace function public.finish_material_job(p_job_id uuid,p_lease_token uuid,p_segments jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; source public.materials; segment record; usable integer; usable_ocr integer;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  if jsonb_typeof(p_segments)<>'array' or jsonb_array_length(p_segments) not between 1 and 200 then raise exception 'invalid_segments'; end if;
  select * into source from public.materials where id=job.material_id for update;
  if source.source_type in ('docx','pptx') and not exists(select 1 from public.assets where material_id=source.id and role='normalized_pdf' and uploaded_at is not null) then raise exception 'normalized_pdf_missing'; end if;
  if not exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages' and status='reserved')
    then raise exception 'import_reservation_missing'; end if;
  for segment in select value,ordinality from jsonb_array_elements(p_segments) with ordinality loop
    if (segment.value->>'ordinal')::integer<>segment.ordinality or
      (source.source_type='text' and (segment.value->'locator'->>'type'<>'paragraph' or
        (segment.value->'locator'->>'paragraph')::integer<>segment.ordinality or segment.value->>'extraction_method'<>'text')) or
      (source.source_type in ('pdf','docx','pptx') and (segment.value->'locator'->>'type'<>'page' or
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
