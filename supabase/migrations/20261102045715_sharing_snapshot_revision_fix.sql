create or replace function public.sharing_preview(p_owner_id uuid,p_study_set_id uuid,p_include_sources boolean default false,p_version_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; saved_version public.study_set_versions; sources jsonb; items jsonb; snapshot_content jsonb;
  version_number integer; public_sources jsonb; snapshot jsonb; disclosure jsonb;
begin
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if p_include_sources is null then return jsonb_build_object('error','invalid_request'); end if;
  if output.type='notes' and p_version_id is null then
    select * into saved_version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id
      and settings->>'draftRevision'=output.draft_revision::text and content->>'markdown'=output.draft_content->>'markdown'
      order by version desc limit 1;
    snapshot_content:=output.draft_content;
  else
    select * into saved_version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id
      and (p_version_id is null or id=p_version_id) order by version desc limit 1;
    if not found then return jsonb_build_object('error','not_ready'); end if;
    snapshot_content:=saved_version.content;
  end if;
  version_number:=coalesce(saved_version.version,(select coalesce(max(v.version),0)+1 from public.study_set_versions v where v.study_set_id=output.id));
  select coalesce(jsonb_agg(jsonb_build_object('source_key','source_'||src.position,'material_id',m.id,'extraction_version',src.extraction_version,
    'title',m.title,'source_type',m.source_type,'asset_id',a.id,'object_key',a.object_key,'mime',coalesce(a.mime,''),'bytes',a.bytes,
    'source_sha256',a.source_sha256,'available',coalesce(a.uploaded_at is not null and m.status in ('ready','partial') and m.extraction_version=src.extraction_version,false))
    order by src.position),'[]') into sources
  from (
    select selected.material_id,selected.extraction_version,row_number() over(order by selected.material_id) position from (
      select material_id,extraction_version from public.study_set_sources where version_id=saved_version.id and owner_id=p_owner_id
      union all select output.material_id,m.extraction_version from public.materials m
        where saved_version.id is null and m.id=output.material_id and m.owner_id=p_owner_id
    ) selected
  ) src join public.materials m on m.id=src.material_id and m.owner_id=p_owner_id
    left join public.assets a on a.material_id=m.id and a.owner_id=p_owner_id and a.role='original';
  if jsonb_array_length(sources)=0 then return jsonb_build_object('error','source_unavailable'); end if;
  if p_include_sources and exists(select 1 from jsonb_array_elements(sources) source where source->>'available'<>'true')
    then return jsonb_build_object('error','source_unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',source->>'source_key','title',source->>'title','type',source->>'source_type','mime',source->>'mime')),'[]')
    into public_sources from jsonb_array_elements(sources) source where p_include_sources;
  if output.type='flashcards' then
    select coalesce(jsonb_agg(jsonb_build_object('kind','flashcard','key','item_'||i.position,'position',i.position,
      'front',coalesce(i.prompt->>'front',''),'back',coalesce(i.answer->>'back',''),'hint',coalesce(i.prompt->>'hint',''),
      'explanation',coalesce(i.answer->>'explanation',''),'citations',public.sharing_citations(i.citations,sources)) order by i.position),'[]')
      into items from public.study_items i where i.version_id=saved_version.id and i.owner_id=p_owner_id and i.kind='flashcard';
  elsif output.type in ('quiz','exam') then
    -- Deliberately build a new public projection: no keys, rubrics, correctness, or answer-bearing source quotations.
    select coalesce(jsonb_agg(jsonb_build_object('kind','question','key','item_'||i.position,'position',i.position,
      'type',i.prompt->>'type','text',i.prompt->>'text','options',
        (select coalesce(jsonb_agg(jsonb_build_object('id',option->>'id','text',option->>'text')),'[]') from jsonb_array_elements(i.prompt->'options') option))
      order by i.position),'[]') into items from public.study_items i where i.version_id=saved_version.id and i.owner_id=p_owner_id and i.kind='question';
  else items:='[]'; end if;
  snapshot:=jsonb_build_object('title',output.title,'type',output.type,'version',version_number,
    'markdown',case when output.type in ('notes','summary') then coalesce(snapshot_content->>'markdown','') else '' end,
    'description',case when output.type='flashcards' then coalesce(snapshot_content->>'description','') else '' end,
    'citations',case when output.type='summary' then public.sharing_citations(snapshot_content->'citations',sources) else '[]'::jsonb end,
    'items',items,'sources',public_sources);
  disclosure:=jsonb_build_object('content',case when output.type in ('quiz','exam') then
      'Question text and options only. Answers, rubrics, results, and source quotations stay private.'
    when output.type='flashcards' then 'Flashcard fronts, backs, hints, explanations, and displayed citations are included.'
    else 'The saved text and its displayed citations are included.' end,
    'originals',case when p_include_sources then 'Only the listed original source files are included.' else 'Original source files are excluded.' end,
    'limitations','Read-only. Private conversations, annotations, reading state, and assessment attempts are excluded. Revocation blocks new requests; file links already issued last up to 60 seconds, and downloaded copies cannot be recalled.');
  return jsonb_build_object('studySetId',output.id,'versionId',saved_version.id,'revision',output.draft_revision,
    'includeOriginals',p_include_sources,'snapshot',snapshot,'disclosure',disclosure,'sourceManifest',sources);
end $$;


create or replace function public.create_output_share(p_owner_id uuid,p_study_set_id uuid,p_revision integer,p_request_id uuid,p_token_hash text,
  p_include_sources boolean default false,p_version_id uuid default null,p_expires_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; existing public.share_links; prepared jsonb; requested jsonb; new_version uuid; new_version_number integer;
begin
  if p_request_id is null or p_revision is null or p_revision<0 or p_token_hash !~ '^[a-f0-9]{64}$' or p_include_sources is null
    then return jsonb_build_object('error','invalid_request'); end if;
  requested:=jsonb_build_object('versionId',p_version_id,'revision',p_revision,'includeOriginals',p_include_sources,'expiresAt',p_expires_at);
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into existing from public.share_links where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if existing.study_set_id<>p_study_set_id or existing.request_data<>requested then return jsonb_build_object('error','request_conflict'); end if;
    if existing.token_hash<>p_token_hash then return jsonb_build_object('error','share_key_changed'); end if;
    if existing.revoked_at is not null or existing.expires_at<=clock_timestamp() then return jsonb_build_object('error','share_unavailable'); end if;
    return jsonb_build_object('shareId',existing.id);
  end if;
  if p_expires_at<=clock_timestamp() then return jsonb_build_object('error','invalid_expiry'); end if;
  if p_version_id is null and output.draft_revision<>p_revision then return jsonb_build_object('error','revision_conflict'); end if;
  prepared:=public.sharing_preview(p_owner_id,output.id,p_include_sources,p_version_id);
  if prepared ? 'error' then return prepared; end if;
  new_version:=(prepared->>'versionId')::uuid;
  if new_version is null then
    -- Notes publish exactly the saved revision while the note row is locked.
    new_version_number:=(prepared->'snapshot'->>'version')::integer;
    insert into public.study_set_versions(study_set_id,owner_id,version,content,settings)
      values(output.id,p_owner_id,new_version_number,output.draft_content,jsonb_build_object('draftRevision',output.draft_revision)) returning id into new_version;
    insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
      select new_version,(source->>'material_id')::uuid,p_owner_id,(source->>'extraction_version')::integer
        from jsonb_array_elements(prepared->'sourceManifest') source;
  end if;
  insert into public.share_links(owner_id,study_set_id,version_id,request_id,request_data,token_hash,title,type,snapshot,source_snapshot,include_sources,expires_at)
    values(p_owner_id,output.id,new_version,p_request_id,requested,p_token_hash,output.title,output.type,prepared->'snapshot',
      prepared->'sourceManifest',p_include_sources,p_expires_at) returning * into existing;
  return jsonb_build_object('shareId',existing.id);
end $$;
