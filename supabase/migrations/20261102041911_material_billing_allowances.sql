-- Compatibility limit arguments remain accepted; server-side active-plan context is authoritative.


create or replace function public.reserve_material_upload(p_owner_id uuid, p_space_id uuid,
  p_request_id uuid, p_title text, p_bytes bigint, p_storage_limit bigint)
returns public.materials language plpgsql security invoker set search_path = '' as $$
declare result public.materials; account jsonb;
begin
  perform 1 from public.profiles where id = p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  account:=public.billing_account_context(p_owner_id);
  select * into result from public.materials where owner_id = p_owner_id and request_id = p_request_id;
  if found then return result; end if;
  if p_space_id is not null and not exists (select 1 from public.spaces where id = p_space_id and owner_id = p_owner_id)
    then raise exception 'space_not_found'; end if;
  if p_bytes < 1 or p_bytes > 25000000 then raise exception 'file_size_limit'; end if;
  if (select coalesce(sum(bytes), 0) from public.assets where owner_id = p_owner_id) + p_bytes >(account->'limits'->>'storageBytes')::bigint
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id, space_id, request_id, title, source_type)
    values (p_owner_id,p_space_id,p_request_id,p_title,'pdf') returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes)
    values (result.id,p_owner_id,p_owner_id::text || '/' || result.id::text || '/original.pdf','application/pdf',p_bytes);
  return result;
end $$;


create or replace function public.reserve_text_material(p_owner_id uuid,p_space_id uuid,p_request_id uuid,
  p_title text,p_bytes bigint,p_sha256 text,p_storage_limit bigint default 100000000)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; account jsonb;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  account:=public.billing_account_context(p_owner_id);
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
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes>(account->'limits'->>'storageBytes')::bigint
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type)
    values(p_owner_id,p_space_id,p_request_id,p_title,'text') returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes,source_sha256)
    values(result.id,p_owner_id,p_owner_id::text||'/'||result.id::text||'/original.txt','text/plain; charset=utf-8',p_bytes,p_sha256);
  return result;
end $$;


create or replace function public.reserve_office_material_upload(p_owner_id uuid,p_space_id uuid,p_request_id uuid,
  p_title text,p_bytes bigint,p_source_type text,p_storage_limit bigint default 100000000)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; account jsonb;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  account:=public.billing_account_context(p_owner_id);
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
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes>(account->'limits'->>'storageBytes')::bigint
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type) values(p_owner_id,p_space_id,p_request_id,p_title,p_source_type) returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes) values(result.id,p_owner_id,
    p_owner_id::text||'/'||result.id::text||'/original.'||p_source_type,
    case when p_source_type='docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      else 'application/vnd.openxmlformats-officedocument.presentationml.presentation' end,p_bytes);
  return result;
end $$;


create or replace function public.reserve_normalized_pdf(p_job_id uuid,p_lease_token uuid,p_bytes bigint,p_sha256 text,p_storage_limit bigint default 100000000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; asset public.assets; source public.materials; result jsonb; account jsonb;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  perform 1 from public.profiles where id=owner for update;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  select * into source from public.materials where id=job.material_id and source_type in ('docx','pptx');
  if not found then raise exception 'office_source_required'; end if;
  if p_bytes not between 1 and 50000000 or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid_normalized_pdf'; end if;
  select * into asset from public.assets where material_id=source.id and role='normalized_pdf' for update;
  if not found or asset.uploaded_at is null then
    if (select coalesce(sum(bytes),0) from public.assets where owner_id=owner and id is distinct from asset.id)+p_bytes>(account->'limits'->>'storageBytes')::bigint
      then raise exception 'storage_quota_exceeded'; end if;
    insert into public.assets(material_id,owner_id,role,object_key,mime,bytes,source_sha256)
      values(source.id,owner,'normalized_pdf',owner::text||'/'||source.id::text||'/normalized-v'||source.extraction_version::text||'.pdf','application/pdf',p_bytes,p_sha256)
      on conflict(material_id,role) do update set bytes=excluded.bytes,source_sha256=excluded.source_sha256 returning * into asset;
  end if;
  result:=jsonb_build_object('object_key',asset.object_key,'bytes',asset.bytes,'sha256',asset.source_sha256,'uploaded',asset.uploaded_at is not null);
  update public.processing_jobs set input=jsonb_set(input,'{normalized_pdf}',result),updated_at=now() where id=job.id;
  return result;
end $$;


create or replace function public.reserve_material_processing(p_job_id uuid,p_lease_token uuid,
  p_document_units integer,p_ocr_units integer,p_page_limit integer default 50,p_ocr_limit integer default 5)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; owner uuid; period uuid; account jsonb;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  perform 1 from public.profiles where id=owner for update;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.material_id is null or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now()
    then return false; end if;
  if p_document_units not between 1 and 200 or p_ocr_units not between 0 and p_document_units then raise exception 'invalid_import_units'; end if;
  if exists(select 1 from public.usage_ledger where processing_job_id=job.id and
    ((feature='document_pages' and units<>p_document_units) or (feature='ocr_pages' and units<>p_ocr_units)))
    then raise exception 'import_reservation_conflict'; end if;
  if exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages' and status in ('reserved','succeeded','uncertain'))
    then return true; end if;
  period:=(account->>'periodId')::uuid;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='document_pages'
    and status<>'failed' and processing_job_id is distinct from job.id)+p_document_units>(account->'limits'->>'documentPages')::integer
    then raise exception 'document_page_quota_exceeded'; end if;
  if (select coalesce(sum(units),0) from public.usage_ledger where period_id=period and feature='ocr_pages'
    and status<>'failed' and processing_job_id is distinct from job.id)+p_ocr_units>(account->'limits'->>'ocrPages')::integer
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


create or replace function public.queue_material(p_owner_id uuid,p_material_id uuid,p_retry boolean default false)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; job_id uuid; msg_id bigint; account jsonb;
begin
  account:=public.billing_account_context(p_owner_id);
  select * into result from public.materials where id=p_material_id and owner_id=p_owner_id for update;
  if not found then raise exception 'material_not_found'; end if;
  if result.status<>'awaiting_upload' and not(p_retry and result.status='failed') then return result; end if;
  if (select count(*) from public.processing_jobs where owner_id=p_owner_id and state in ('queued','running') and material_id is distinct from p_material_id)>=(account->'limits'->>'concurrentJobs')::integer then raise exception 'concurrent_job_limit'; end if;
  update public.assets set uploaded_at=coalesce(uploaded_at,now()) where material_id=result.id and role='original';
  insert into public.processing_jobs(material_id,owner_id) values(result.id,p_owner_id)
    on conflict(material_id) do update set state='queued',attempt=0,error_code=null,lease_token=null,lease_until=null,updated_at=now()
    returning id into job_id;
  select pgmq.send('material_jobs',jsonb_build_object('job_id',job_id)) into msg_id;
  update public.processing_jobs set message_id=msg_id where id=job_id;
  update public.materials set status='queued',error_code=null,updated_at=now() where id=result.id returning * into result;
  return result;
end $$;

