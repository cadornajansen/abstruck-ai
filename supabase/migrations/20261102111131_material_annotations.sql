create function public.valid_pdf_highlight_locator(p_locator jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare rect jsonb; field text; page numeric;
begin
  if jsonb_typeof(p_locator) is distinct from 'object' or p_locator->>'type' is distinct from 'page' or
    jsonb_typeof(p_locator->'page') is distinct from 'number' or
    jsonb_typeof(p_locator->'rects') is distinct from 'array' or
    jsonb_typeof(p_locator->'quote') is distinct from 'string' then return false; end if;
  page:=(p_locator->>'page')::numeric;
  if page<>trunc(page) or page<1 or page>=2147483647 or
    jsonb_array_length(p_locator->'rects') not between 1 and 80 or
    char_length(btrim(p_locator->>'quote')) not between 1 and 4000 then return false; end if;
  for rect in select value from jsonb_array_elements(p_locator->'rects') loop
    if jsonb_typeof(rect) is distinct from 'object' then return false; end if;
    foreach field in array array['x','y','width','height'] loop
      if jsonb_typeof(rect->field) is distinct from 'number' then return false; end if;
    end loop;
    if (rect->>'x')::numeric not between 0 and 1 or (rect->>'y')::numeric not between 0 and 1 or
      (rect->>'width')::numeric<=0 or (rect->>'height')::numeric<=0 or
      (rect->>'x')::numeric+(rect->>'width')::numeric>1 or
      (rect->>'y')::numeric+(rect->>'height')::numeric>1 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create table public.material_annotations (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null,
  extraction_version integer not null check(extraction_version>=1),
  locator jsonb not null check(public.valid_pdf_highlight_locator(locator)),
  body text not null default '' check(char_length(body)<=4000),
  color text not null default 'yellow' check(color in ('yellow','green','blue','red')),
  revision integer not null default 0 check(revision>=0),
  creation_fingerprint text not null check(char_length(creation_fingerprint)=32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(material_id,owner_id) references public.materials(id,owner_id) on delete cascade
);
create index material_annotations_owner_material_version_idx on public.material_annotations(owner_id,material_id,extraction_version,created_at);
alter table public.material_annotations enable row level security;
create policy material_annotations_read_own on public.material_annotations for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.material_annotations from public,anon,authenticated;
grant select on public.material_annotations to authenticated;
grant all on public.material_annotations to service_role;

create function public.create_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_locator jsonb,p_body text default '',p_color text default 'yellow')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; fingerprint text; current_version jsonb;
begin
  if p_annotation_id is null or p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    not public.valid_pdf_highlight_locator(p_locator) or p_body is null or
    char_length(p_body)>4000 or p_color is null or p_color not in ('yellow','green','blue','red') then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id for share;
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
  if material.source_type not in ('pdf','docx','pptx') or material.status not in ('ready','partial') then
    return current_version||jsonb_build_object('status','source_unavailable');
  end if;
  if annotation.id is not null then
    return current_version||jsonb_build_object('status','ok','annotation',to_jsonb(annotation)-'creation_fingerprint');
  end if;
  if not exists(select 1 from public.source_segments where material_id=p_material_id and owner_id=p_owner_id
    and extraction_version=p_extraction_version and locator->>'type'='page' and locator->'page'=p_locator->'page') then
    return current_version||jsonb_build_object('status','invalid_page');
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

create function public.edit_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_revision integer,p_body text,p_color text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; snapshot jsonb;
begin
  if p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    p_revision is null or p_revision not between 0 and 2147483646 or
    p_body is null or char_length(p_body)>4000 or p_color is null or p_color not in ('yellow','green','blue','red') then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id for share;
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

create function public.delete_material_annotation(p_owner_id uuid,p_material_id uuid,p_annotation_id uuid,
  p_extraction_version integer,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; annotation public.material_annotations; snapshot jsonb;
begin
  if p_extraction_version is null or p_extraction_version not between 1 and 2147483646 or
    p_revision is null or p_revision not between 0 and 2147483646 then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id for share;
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

revoke all on function public.valid_pdf_highlight_locator(jsonb),public.create_material_annotation(uuid,uuid,uuid,integer,jsonb,text,text),
  public.edit_material_annotation(uuid,uuid,uuid,integer,integer,text,text),public.delete_material_annotation(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.valid_pdf_highlight_locator(jsonb),public.create_material_annotation(uuid,uuid,uuid,integer,jsonb,text,text),
  public.edit_material_annotation(uuid,uuid,uuid,integer,integer,text,text),public.delete_material_annotation(uuid,uuid,uuid,integer,integer) to service_role;
