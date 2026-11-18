-- Preserve native PDF anchors while allowing one immutable transcript-segment anchor.
create function public.valid_material_annotation_locator(p_locator jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare start_ms numeric; end_ms numeric;
begin
  if p_locator->>'type'='page' then return public.valid_pdf_highlight_locator(p_locator); end if;
  if jsonb_typeof(p_locator) is distinct from 'object' or p_locator->>'type' is distinct from 'time' or
    jsonb_typeof(p_locator->'segmentId') is distinct from 'string' or (p_locator->>'segmentId') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or
    jsonb_typeof(p_locator->'startMs') is distinct from 'number' or jsonb_typeof(p_locator->'endMs') is distinct from 'number' or
    jsonb_typeof(p_locator->'quote') is distinct from 'string' or char_length(btrim(p_locator->>'quote')) not between 1 and 4000 then return false; end if;
  start_ms:=(p_locator->>'startMs')::numeric; end_ms:=(p_locator->>'endMs')::numeric;
  return start_ms=trunc(start_ms) and end_ms=trunc(end_ms) and start_ms>=0 and end_ms>start_ms and end_ms<2147483647;
exception when others then return false;
end $$;

alter table public.material_annotations drop constraint material_annotations_locator_check;
alter table public.material_annotations add constraint material_annotations_locator_check check(public.valid_material_annotation_locator(locator));

create or replace function public.create_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_locator jsonb,p_body text default '',p_color text default 'yellow')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; fingerprint text; current_version jsonb;
begin
  if p_annotation_id is null or p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    not public.valid_material_annotation_locator(p_locator) or p_body is null or
    char_length(p_body)>4000 or p_color is null or p_color not in ('yellow','green','blue','red') then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found or exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='deletion') then return jsonb_build_object('status','not_found'); end if;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id and deleted_at is null for share;
  if not found then return jsonb_build_object('status','not_found'); end if;
  current_version:=jsonb_build_object('currentExtractionVersion',material.extraction_version);
  select * into annotation from public.material_annotations where id=p_annotation_id for update;
  if found and (annotation.owner_id<>p_owner_id or annotation.material_id<>p_material_id) then
    return jsonb_build_object('status','not_found');
  end if;
  fingerprint:=md5(jsonb_build_object('materialId',p_material_id,'extractionVersion',p_extraction_version,
    'locator',p_locator,'body',p_body,'color',p_color)::text);
  if annotation.id is not null and annotation.creation_fingerprint<>fingerprint then
    return current_version||jsonb_build_object('status','request_conflict','annotation',to_jsonb(annotation)-'creation_fingerprint');
  end if;
  if material.extraction_version is distinct from p_extraction_version then
    return current_version||jsonb_build_object('status','source_changed','annotation',case when annotation.id is not null then to_jsonb(annotation)-'creation_fingerprint' else null end);
  end if;
  if material.status not in ('ready','partial') then
    return current_version||jsonb_build_object('status','source_unavailable');
  end if;
  if annotation.id is not null then
    return current_version||jsonb_build_object('status','ok','annotation',to_jsonb(annotation)-'creation_fingerprint');
  end if;
  if material.source_type in ('pdf','docx','pptx') then
    if p_locator->>'type'<>'page' or not exists(select 1 from public.source_segments where material_id=p_material_id and owner_id=p_owner_id
      and extraction_version=p_extraction_version and locator->>'type'='page' and locator->'page'=p_locator->'page') then
      return current_version||jsonb_build_object('status','invalid_page');
    end if;
  elsif material.source_type in ('audio','video','youtube') then
    if p_locator->>'type'<>'time' or not exists(select 1 from public.source_segments s where s.id=(p_locator->>'segmentId')::uuid
      and s.material_id=p_material_id and s.owner_id=p_owner_id and s.extraction_version=p_extraction_version and s.locator->>'type'='time'
      and s.locator->'start_ms'=p_locator->'startMs' and s.locator->'end_ms'=p_locator->'endMs'
      and strpos(s.text,p_locator->>'quote')>0) then
      return current_version||jsonb_build_object('status','invalid_time');
    end if;
  else
    return current_version||jsonb_build_object('status','source_unavailable');
  end if;
  if (select count(*) from public.material_annotations where material_id=p_material_id and owner_id=p_owner_id)>=500 then
    return current_version||jsonb_build_object('status','annotation_limit');
  end if;
  insert into public.material_annotations(id,owner_id,material_id,extraction_version,locator,body,color,creation_fingerprint)
    values(p_annotation_id,p_owner_id,p_material_id,p_extraction_version,p_locator,p_body,p_color,fingerprint)
    on conflict(id) do nothing returning * into annotation;
  if not found then return jsonb_build_object('status','not_found'); end if;
  return current_version||jsonb_build_object('status','ok','annotation',to_jsonb(annotation)-'creation_fingerprint');
end $$;

create or replace function public.edit_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_revision integer,p_body text,p_color text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; snapshot jsonb;
begin
  if p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    p_revision is null or p_revision not between 0 and 2147483646 or
    p_body is null or char_length(p_body)>4000 or p_color is null or p_color not in ('yellow','green','blue','red') then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found or exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='deletion') then return jsonb_build_object('status','not_found'); end if;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id and deleted_at is null for share;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into annotation from public.material_annotations where id=p_annotation_id and owner_id=p_owner_id and material_id=p_material_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  snapshot:=jsonb_build_object('annotation',to_jsonb(annotation)-'creation_fingerprint','currentExtractionVersion',material.extraction_version);
  if annotation.extraction_version is distinct from p_extraction_version or material.extraction_version is distinct from p_extraction_version then
    return snapshot||jsonb_build_object('status','source_changed');
  end if;
  if material.status not in ('ready','partial') then return snapshot||jsonb_build_object('status','source_unavailable'); end if;
  if annotation.revision is distinct from p_revision then return snapshot||jsonb_build_object('status','conflict'); end if;
  update public.material_annotations set body=p_body,color=p_color,revision=revision+1,updated_at=now()
    where id=annotation.id returning * into annotation;
  return jsonb_build_object('status','ok','annotation',to_jsonb(annotation)-'creation_fingerprint','currentExtractionVersion',material.extraction_version);
end $$;

create or replace function public.delete_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; snapshot jsonb;
begin
  if p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    p_revision is null or p_revision not between 0 and 2147483646 then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found or exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='deletion') then return jsonb_build_object('status','not_found'); end if;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id and deleted_at is null for share;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into annotation from public.material_annotations where id=p_annotation_id and owner_id=p_owner_id and material_id=p_material_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  snapshot:=jsonb_build_object('annotation',to_jsonb(annotation)-'creation_fingerprint','currentExtractionVersion',material.extraction_version);
  if annotation.extraction_version is distinct from p_extraction_version then return snapshot||jsonb_build_object('status','source_changed'); end if;
  if annotation.revision is distinct from p_revision then return snapshot||jsonb_build_object('status','conflict'); end if;
  -- Explicit deletion of an old-version annotation is allowed; its anchor is never moved.
  delete from public.material_annotations where id=annotation.id;
  return jsonb_build_object('status','ok','deleted',true,'currentExtractionVersion',material.extraction_version);
end $$;

revoke all on function public.valid_material_annotation_locator(jsonb) from public,anon,authenticated;
grant execute on function public.valid_material_annotation_locator(jsonb) to service_role;
