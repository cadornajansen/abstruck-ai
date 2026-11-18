-- Public snapshots are explicit projections; never serialize private version JSON.
alter table public.share_links drop constraint share_links_type_check;
alter table public.share_links add constraint share_links_type_check check(type in
  ('notes','summary','flashcards','quiz','exam','podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart'));
alter table public.share_links add column artifact_snapshot jsonb
  check(artifact_snapshot is null or jsonb_typeof(artifact_snapshot)='object');

create function public.sharing_advanced_content(p_content jsonb,p_sources jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; kind text:=p_content->>'kind'; entries jsonb;
begin
  result:=jsonb_build_object('formatVersion',1,'kind',kind,'inputKind',p_content->>'inputKind',
    'title',p_content->>'title','description',p_content->>'description',
    'citations',public.sharing_citations(p_content->'citations',p_sources));
  if kind in ('mind-map','flowchart') then
    select coalesce(jsonb_agg(jsonb_build_object('id',n->>'id','label',n->>'label','detail',n->>'detail','kind',n->>'kind',
      'citations',public.sharing_citations(n->'citations',p_sources)) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'nodes') with ordinality nodes(n,ord);
    result:=result||jsonb_build_object('rootId',p_content->>'rootId','nodes',entries);
    select coalesce(jsonb_agg(jsonb_build_object('from',e->>'from','to',e->>'to','label',e->>'label') order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'edges') with ordinality edges(e,ord);
    result:=result||jsonb_build_object('edges',entries);
  elsif kind='timeline' then
    select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','date',e->>'date','label',e->>'label','detail',e->>'detail',
      'citations',public.sharing_citations(e->'citations',p_sources)) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'events') with ordinality events(e,ord);
    result:=result||jsonb_build_object('events',entries);
  elsif kind in ('bar-chart','line-chart') then
    select coalesce(jsonb_agg(jsonb_build_object('name',s->>'name','points',
      (select coalesce(jsonb_agg(jsonb_build_object('label',p->>'label','value',p->'value',
        'citations',public.sharing_citations(p->'citations',p_sources)) order by point_ord),'[]')
       from jsonb_array_elements(s->'points') with ordinality points(p,point_ord))) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'series') with ordinality series(s,ord);
    result:=result||jsonb_build_object('xLabel',p_content->>'xLabel','yLabel',p_content->>'yLabel','unit',p_content->>'unit','series',entries);
  elsif kind='interactive' then
    select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','prompt',s->>'prompt','hint',s->>'hint',
      'correctChoiceId',s->>'correctChoiceId','explanation',s->>'explanation','citations',public.sharing_citations(s->'citations',p_sources),
      'choices',(select coalesce(jsonb_agg(jsonb_build_object('id',c->>'id','text',c->>'text') order by choice_ord),'[]')
        from jsonb_array_elements(s->'choices') with ordinality choices(c,choice_ord))) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'steps') with ordinality steps(s,ord);
    result:=result||jsonb_build_object('steps',entries);
  elsif kind='podcast' then
    select coalesce(jsonb_agg(jsonb_build_object('speaker',p->>'speaker','text',p->>'text',
      'citations',public.sharing_citations(p->'citations',p_sources)) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'script') with ordinality parts(p,ord);
    result:=result||jsonb_build_object('script',entries);
  elsif kind='video' then
    select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','title',s->>'title','narration',s->>'narration',
      'bullets',(select coalesce(jsonb_agg(b order by bullet_ord),'[]') from jsonb_array_elements_text(s->'bullets') with ordinality bullets(b,bullet_ord)),
      'citations',public.sharing_citations(s->'citations',p_sources)) order by ord),'[]') into entries
      from jsonb_array_elements(p_content->'slides') with ordinality slides(s,ord);
    result:=result||jsonb_build_object('slides',entries);
  else raise exception 'unsupported_output_type'; end if;
  return result;
end $$;

create or replace function public.sharing_preview(p_owner_id uuid,p_study_set_id uuid,p_include_sources boolean default false,p_version_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; saved public.study_set_versions; artifact public.assets;
  sources jsonb; public_sources jsonb; snapshot jsonb; manifest jsonb:=null;
begin
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if output.type not in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart') then
    return public.sharing_preview_before_outputs(p_owner_id,p_study_set_id,p_include_sources,p_version_id);
  end if;
  if p_include_sources is null then return jsonb_build_object('error','invalid_request'); end if;
  select * into saved from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id
    and (p_version_id is null or id=p_version_id) order by version desc limit 1;
  if not found or saved.content->>'kind' is distinct from output.type then return jsonb_build_object('error','not_ready'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('source_key','source_'||src.position,'material_id',m.id,'extraction_version',src.extraction_version,
    'title',m.title,'source_type',m.source_type,'asset_id',a.id,'object_key',a.object_key,'mime',coalesce(a.mime,''),'bytes',a.bytes,
    'source_sha256',a.source_sha256,'available',coalesce(a.uploaded_at is not null and m.status in ('ready','partial') and m.extraction_version=src.extraction_version,false))
    order by src.position),'[]') into sources
  from (select material_id,extraction_version,row_number() over(order by material_id) position from public.study_set_sources
    where version_id=saved.id and owner_id=p_owner_id) src
    join public.materials m on m.id=src.material_id and m.owner_id=p_owner_id
    left join public.assets a on a.material_id=m.id and a.owner_id=p_owner_id and a.role='original';
  if jsonb_array_length(sources)=0 and saved.content->>'inputKind' is distinct from 'conversation'
    then return jsonb_build_object('error','source_unavailable'); end if;
  if p_include_sources and exists(select 1 from jsonb_array_elements(sources) source where source->>'available'<>'true')
    then return jsonb_build_object('error','source_unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('key',source->>'source_key','title',source->>'title','type',source->>'source_type','mime',source->>'mime')),'[]')
    into public_sources from jsonb_array_elements(sources) source where p_include_sources;
  if output.type in ('podcast','video') then
    -- Current media is immutable version 1. A future media editor must pin its own artifact version.
    select * into artifact from public.assets where study_set_id=output.id and owner_id=p_owner_id and uploaded_at is not null
      and role=case when output.type='podcast' then 'study_audio' else 'study_video' end
      and mime=case when output.type='podcast' then 'audio/mpeg' else 'video/mp4' end;
    if not found or saved.version<>1 or artifact.source_sha256 is null then return jsonb_build_object('error','not_ready'); end if;
    manifest:=jsonb_build_object('asset_id',artifact.id,'object_key',artifact.object_key,'mime',artifact.mime,'bytes',artifact.bytes,
      'source_sha256',artifact.source_sha256,'role',artifact.role,'durationMs',artifact.metadata->'durationMs');
  end if;
  snapshot:=jsonb_build_object('title',output.title,'type',output.type,'version',saved.version,'markdown','','description','',
    'citations','[]'::jsonb,'items','[]'::jsonb,'sources',public_sources,'hasArtifact',manifest is not null,
    'output',public.sharing_advanced_content(saved.content,sources));
  return jsonb_build_object('studySetId',output.id,'versionId',saved.id,'revision',output.draft_revision,
    'includeOriginals',p_include_sources,'snapshot',snapshot,'sourceManifest',sources,'artifactManifest',manifest,
    'disclosure',jsonb_build_object('content',case when output.type='interactive' then
      'The saved practice questions, choices, hints, correct answers, explanations and displayed citations are included. Recipient practice is not saved.'
      when manifest is not null then 'The saved generated media, script and displayed citations are included.'
      else 'The saved diagram, timeline or chart, its data and displayed citations are included.' end,
      'originals',case when p_include_sources then 'Only the listed original source files are included.' else 'Original source files are excluded.' end,
      'limitations','Read-only fixed version. Private conversations, annotations, source segments, attempts and progress are excluded. Revocation blocks new requests; issued file links last up to 60 seconds. Downloaded copies cannot be recalled.'));
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
    new_version_number:=(prepared->'snapshot'->>'version')::integer;
    insert into public.study_set_versions(study_set_id,owner_id,version,content,settings)
      values(output.id,p_owner_id,new_version_number,output.draft_content,jsonb_build_object('draftRevision',output.draft_revision)) returning id into new_version;
    insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
      select new_version,(source->>'material_id')::uuid,p_owner_id,(source->>'extraction_version')::integer
      from jsonb_array_elements(prepared->'sourceManifest') source;
  end if;
  insert into public.share_links(owner_id,study_set_id,version_id,request_id,request_data,token_hash,title,type,snapshot,source_snapshot,artifact_snapshot,include_sources,expires_at)
    values(p_owner_id,output.id,new_version,p_request_id,requested,p_token_hash,output.title,output.type,prepared->'snapshot',
      prepared->'sourceManifest',nullif(prepared->'artifactManifest','null'::jsonb),p_include_sources,p_expires_at) returning * into existing;
  return jsonb_build_object('shareId',existing.id);
end $$;

create function public.shared_artifact_by_hash(p_token_hash text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select s.artifact_snapshot||jsonb_build_object('title',s.title,'source_type',s.type)
    from public.share_links s join public.assets a on a.id=(s.artifact_snapshot->>'asset_id')::uuid
      and a.owner_id=s.owner_id and a.study_set_id=s.study_set_id
    where s.token_hash=p_token_hash and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
      and s.type in ('podcast','video') and a.uploaded_at is not null
      and a.role=s.artifact_snapshot->>'role' and a.object_key=s.artifact_snapshot->>'object_key'
      and a.mime=s.artifact_snapshot->>'mime' and a.bytes=(s.artifact_snapshot->>'bytes')::bigint
      and a.source_sha256=s.artifact_snapshot->>'source_sha256';
$$;

revoke all on function public.sharing_advanced_content(jsonb,jsonb),public.sharing_preview(uuid,uuid,boolean,uuid),
  public.create_output_share(uuid,uuid,integer,uuid,text,boolean,uuid,timestamptz),public.shared_artifact_by_hash(text) from public,anon,authenticated;
grant execute on function public.sharing_advanced_content(jsonb,jsonb),public.sharing_preview(uuid,uuid,boolean,uuid),
  public.create_output_share(uuid,uuid,integer,uuid,text,boolean,uuid,timestamptz),public.shared_artifact_by_hash(text) to service_role;
