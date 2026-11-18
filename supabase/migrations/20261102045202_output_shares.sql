create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  study_set_id uuid not null,
  version_id uuid not null,
  request_id uuid not null,
  request_data jsonb not null,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  title text not null,
  type text not null check(type in ('notes','summary','flashcards','quiz','exam')),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=1000000),
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='array'),
  include_sources boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id,request_id),
  foreign key(version_id,study_set_id,owner_id) references public.study_set_versions(id,study_set_id,owner_id) on delete cascade
);
create index share_links_owner_created_idx on public.share_links(owner_id,created_at desc);
create index share_links_version_set_owner_idx on public.share_links(version_id,study_set_id,owner_id);
alter table public.share_links enable row level security;
create policy share_links_read_own on public.share_links for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.share_links from anon,authenticated,service_role;
grant select(id,owner_id,study_set_id,version_id,title,type,include_sources,expires_at,revoked_at,created_at) on public.share_links to authenticated;
grant select,insert,update,delete on public.share_links to service_role;

create function public.sharing_citations(p_citations jsonb,p_sources jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sourceKey',source->>'source_key','page',(citation->>'page')::integer,
    'quote',left(citation->>'quote',600))),'[]')
  from jsonb_array_elements(case when jsonb_typeof(p_citations)='array' then p_citations else '[]' end) citation
    join jsonb_array_elements(p_sources) source on source->>'material_id'=citation->>'material_id'
  where jsonb_typeof(citation->'page')='number' and citation->>'quote' is not null;
$$;

create function public.sharing_preview(p_owner_id uuid,p_study_set_id uuid,p_include_sources boolean default false,p_version_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; version public.study_set_versions; sources jsonb; items jsonb; content jsonb;
  version_number integer; public_sources jsonb; snapshot jsonb; disclosure jsonb;
begin
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if p_include_sources is null then return jsonb_build_object('error','invalid_request'); end if;
  if output.type='notes' and p_version_id is null then
    select * into version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id
      and settings->>'draftRevision'=output.draft_revision::text and content->>'markdown'=output.draft_content->>'markdown'
      order by version desc limit 1;
    content:=output.draft_content;
  else
    select * into version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id
      and (p_version_id is null or id=p_version_id) order by version desc limit 1;
    if not found then return jsonb_build_object('error','not_ready'); end if;
    content:=version.content;
  end if;
  version_number:=coalesce(version.version,(select coalesce(max(v.version),0)+1 from public.study_set_versions v where v.study_set_id=output.id));
  select coalesce(jsonb_agg(jsonb_build_object('source_key','source_'||src.position,'material_id',m.id,'extraction_version',src.extraction_version,
    'title',m.title,'source_type',m.source_type,'asset_id',a.id,'object_key',a.object_key,'mime',coalesce(a.mime,''),'bytes',a.bytes,
    'source_sha256',a.source_sha256,'available',coalesce(a.uploaded_at is not null and m.status in ('ready','partial') and m.extraction_version=src.extraction_version,false))
    order by src.position),'[]') into sources
  from (
    select selected.material_id,selected.extraction_version,row_number() over(order by selected.material_id) position from (
      select material_id,extraction_version from public.study_set_sources where version_id=version.id and owner_id=p_owner_id
      union all select output.material_id,m.extraction_version from public.materials m
        where version.id is null and m.id=output.material_id and m.owner_id=p_owner_id
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
      into items from public.study_items i where i.version_id=version.id and i.owner_id=p_owner_id and i.kind='flashcard';
  elsif output.type in ('quiz','exam') then
    -- Deliberately build a new public projection: no keys, rubrics, correctness, or answer-bearing source quotations.
    select coalesce(jsonb_agg(jsonb_build_object('kind','question','key','item_'||i.position,'position',i.position,
      'type',i.prompt->>'type','text',i.prompt->>'text','options',
        (select coalesce(jsonb_agg(jsonb_build_object('id',option->>'id','text',option->>'text')),'[]') from jsonb_array_elements(i.prompt->'options') option))
      order by i.position),'[]') into items from public.study_items i where i.version_id=version.id and i.owner_id=p_owner_id and i.kind='question';
  else items:='[]'; end if;
  snapshot:=jsonb_build_object('title',output.title,'type',output.type,'version',version_number,
    'markdown',case when output.type in ('notes','summary') then coalesce(content->>'markdown','') else '' end,
    'description',case when output.type='flashcards' then coalesce(content->>'description','') else '' end,
    'citations',case when output.type='summary' then public.sharing_citations(content->'citations',sources) else '[]'::jsonb end,
    'items',items,'sources',public_sources);
  disclosure:=jsonb_build_object('content',case when output.type in ('quiz','exam') then
      'Question text and options only. Answers, rubrics, results, and source quotations stay private.'
    when output.type='flashcards' then 'Flashcard fronts, backs, hints, explanations, and displayed citations are included.'
    else 'The saved text and its displayed citations are included.' end,
    'originals',case when p_include_sources then 'Only the listed original source files are included.' else 'Original source files are excluded.' end,
    'limitations','Read-only. Private conversations, annotations, reading state, and assessment attempts are excluded. Revocation blocks new requests; file links already issued last up to 60 seconds, and downloaded copies cannot be recalled.');
  return jsonb_build_object('studySetId',output.id,'versionId',version.id,'revision',output.draft_revision,
    'includeOriginals',p_include_sources,'snapshot',snapshot,'disclosure',disclosure,'sourceManifest',sources);
end $$;

create function public.create_output_share(p_owner_id uuid,p_study_set_id uuid,p_revision integer,p_request_id uuid,p_token_hash text,
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
  if output.type='notes' and p_version_id is null and output.draft_revision<>p_revision then return jsonb_build_object('error','revision_conflict'); end if;
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

create function public.shared_output_by_hash(p_token_hash text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('snapshot',snapshot,'sharedAt',created_at,'expiresAt',expires_at,'includeOriginals',include_sources,'sourceTtlSeconds',60)
    from public.share_links where token_hash=p_token_hash and revoked_at is null and (expires_at is null or expires_at>now());
$$;

create function public.shared_source_by_hash(p_token_hash text,p_source_key text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select source||jsonb_build_object('shareId',s.id,'ownerId',s.owner_id) from public.share_links s
    cross join lateral jsonb_array_elements(s.source_snapshot) source
    join public.materials m on m.id=(source->>'material_id')::uuid and m.owner_id=s.owner_id
    join public.assets a on a.id=(source->>'asset_id')::uuid and a.owner_id=s.owner_id and a.material_id=m.id and a.role='original'
  where s.token_hash=p_token_hash and s.include_sources and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
    and source->>'source_key'=p_source_key and m.status in ('ready','partial') and m.extraction_version=(source->>'extraction_version')::integer
    and a.uploaded_at is not null and a.object_key=source->>'object_key' and a.mime=source->>'mime' and a.bytes=(source->>'bytes')::bigint
    and a.source_sha256 is not distinct from source->>'source_sha256';
$$;

create function public.revoke_output_share(p_owner_id uuid,p_share_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.share_links set revoked_at=coalesce(revoked_at,now()) where id=p_share_id and owner_id=p_owner_id;
  return found;
end $$;

create function public.revoke_deleted_material_shares()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  update public.share_links s set revoked_at=coalesce(revoked_at,now()) where s.owner_id=old.owner_id
    and exists(select 1 from jsonb_array_elements(s.source_snapshot) source where source->>'material_id'=old.id::text);
  return old;
end $$;
create trigger revoke_material_output_shares before delete on public.materials for each row execute function public.revoke_deleted_material_shares();

revoke all on function public.sharing_citations(jsonb,jsonb),public.sharing_preview(uuid,uuid,boolean,uuid),
  public.create_output_share(uuid,uuid,integer,uuid,text,boolean,uuid,timestamptz),public.shared_output_by_hash(text),
  public.shared_source_by_hash(text,text),public.revoke_output_share(uuid,uuid),public.revoke_deleted_material_shares()
  from public,anon,authenticated;
grant execute on function public.sharing_citations(jsonb,jsonb),public.sharing_preview(uuid,uuid,boolean,uuid),
  public.create_output_share(uuid,uuid,integer,uuid,text,boolean,uuid,timestamptz),public.shared_output_by_hash(text),
  public.shared_source_by_hash(text,text),public.revoke_output_share(uuid,uuid),public.revoke_deleted_material_shares() to service_role;
