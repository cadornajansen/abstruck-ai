create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid not null,
  creation_space_id uuid not null,
  request_id uuid not null,
  creation_title text,
  title text not null check(char_length(btrim(title)) between 1 and 120),
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,request_id), unique(id,space_id,owner_id),
  foreign key(space_id,owner_id) references public.spaces(id,owner_id) on delete cascade,
  check(creation_title is null or char_length(btrim(creation_title)) between 1 and 120)
);
create index folders_owner_space_created_idx on public.folders(owner_id,space_id,created_at);
alter table public.folders enable row level security;
create policy folders_read_own on public.folders for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.folders from public,anon,authenticated;
grant select on public.folders to authenticated;
grant all on public.folders to service_role;

alter table public.materials add column folder_id uuid;
alter table public.materials add column location_revision integer not null default 0 check(location_revision>=0);
alter table public.materials add column initial_folder_request jsonb not null default '{}';
alter table public.materials add constraint materials_folder_requires_space check(folder_id is null or space_id is not null);
alter table public.materials add constraint materials_folder_owner_space_fkey foreign key(folder_id,space_id,owner_id)
  references public.folders(id,space_id,owner_id) on update cascade on delete set null(folder_id);
create index materials_space_folder_idx on public.materials(owner_id,space_id,folder_id);

create function public.track_material_location()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Existing space deletion unfiles materials through its FK action.
  if new.space_id is null then new.folder_id:=null; end if;
  if row(new.space_id,new.folder_id) is distinct from row(old.space_id,old.folder_id) then
    new.location_revision:=old.location_revision+1;
    new.updated_at:=now();
  end if;
  return new;
end $$;
create trigger materials_location_revision before update of space_id,folder_id on public.materials for each row execute function public.track_material_location();
revoke all on function public.track_material_location() from public,anon,authenticated;
grant execute on function public.track_material_location() to service_role;

create function public.create_space_folder(p_owner_id uuid,p_space_id uuid,p_request_id uuid,p_title text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare folder public.folders; requested_title text; candidate text; suffix integer:=2;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  requested_title:=case when p_title is null then null else btrim(p_title) end;
  if p_request_id is null or (requested_title is not null and length(requested_title) not between 1 and 120) then return jsonb_build_object('status','invalid'); end if;
  select * into folder from public.folders where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if folder.creation_space_id<>p_space_id or folder.creation_title is distinct from requested_title then return jsonb_build_object('status','request_conflict'); end if;
    return jsonb_build_object('status','ok','folderId',folder.id);
  end if;
  perform 1 from public.spaces where id=p_space_id and owner_id=p_owner_id for key share;
  if not found then return jsonb_build_object('status','not_found'); end if;
  candidate:=coalesce(requested_title,'Untitled Folder');
  if requested_title is null then
    while exists(select 1 from public.folders where space_id=p_space_id and owner_id=p_owner_id and title=candidate) loop
      candidate:=format('Untitled Folder (%s)',suffix); suffix:=suffix+1;
    end loop;
  end if;
  insert into public.folders(owner_id,space_id,creation_space_id,request_id,creation_title,title) values(p_owner_id,p_space_id,p_space_id,p_request_id,requested_title,candidate) returning * into folder;
  return jsonb_build_object('status','ok','folderId',folder.id);
end $$;

create function public.rename_space_folder(p_owner_id uuid,p_folder_id uuid,p_revision integer,p_title text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare folder public.folders;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into folder from public.folders where id=p_folder_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if coalesce(length(btrim(p_title)),0) not between 1 and 120 then return jsonb_build_object('status','invalid'); end if;
  if folder.title=btrim(p_title) then return jsonb_build_object('status','ok','folderId',folder.id); end if;
  if folder.revision is distinct from p_revision then return jsonb_build_object('status','conflict','folderId',folder.id); end if;
  update public.folders set title=btrim(p_title),revision=revision+1,updated_at=now() where id=folder.id;
  return jsonb_build_object('status','ok','folderId',folder.id);
end $$;

create function public.delete_space_folder(p_owner_id uuid,p_folder_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare folder public.folders; contents integer;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into folder from public.folders where id=p_folder_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if folder.revision is distinct from p_revision then return jsonb_build_object('status','conflict','folderId',folder.id); end if;
  select count(*) into contents from public.materials where folder_id=folder.id and owner_id=p_owner_id;
  delete from public.folders where id=folder.id;
  return jsonb_build_object('status','ok','deleted',true,'spaceId',folder.space_id,'unfiledCount',contents);
end $$;

create function public.move_space_folder(p_owner_id uuid,p_folder_id uuid,p_revision integer,p_space_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare folder public.folders; contents uuid[];
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into folder from public.folders where id=p_folder_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if folder.space_id=p_space_id then return jsonb_build_object('status','ok','folderId',folder.id,'movedMaterialCount',0); end if;
  if folder.revision is distinct from p_revision then return jsonb_build_object('status','conflict','folderId',folder.id); end if;
  perform 1 from public.spaces where id=p_space_id and owner_id=p_owner_id for key share;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select coalesce(array_agg(id),'{}') into contents from public.materials where folder_id=folder.id and owner_id=p_owner_id;
  update public.folders set space_id=p_space_id,revision=revision+1,updated_at=now() where id=folder.id;
  update public.study_sets set space_id=p_space_id,updated_at=now() where owner_id=p_owner_id and material_id=any(contents);
  return jsonb_build_object('status','ok','folderId',folder.id,'movedMaterialCount',cardinality(contents));
end $$;

create function public.move_material_location(p_owner_id uuid,p_material_id uuid,p_space_id uuid,p_folder_id uuid,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare material public.materials; location jsonb;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  select * into material from public.materials where id=p_material_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  location:=jsonb_build_object('materialId',material.id,'spaceId',material.space_id,'folderId',material.folder_id,'revision',material.location_revision);
  if p_space_id is null and p_folder_id is not null then return location||jsonb_build_object('status','invalid'); end if;
  if material.source_type='chat' and (p_space_id is not null or p_folder_id is not null) then return location||jsonb_build_object('status','chat_library_only'); end if;
  if row(material.space_id,material.folder_id) is not distinct from row(p_space_id,p_folder_id) then return location||jsonb_build_object('status','ok'); end if;
  if material.location_revision is distinct from p_revision then return location||jsonb_build_object('status','conflict'); end if;
  if p_space_id is not null then
    perform 1 from public.spaces where id=p_space_id and owner_id=p_owner_id for key share;
    if not found then return location||jsonb_build_object('status','not_found'); end if;
  end if;
  if p_folder_id is not null then
    perform 1 from public.folders where id=p_folder_id and owner_id=p_owner_id and space_id=p_space_id for key share;
    if not found then return location||jsonb_build_object('status','not_found'); end if;
  end if;
  update public.materials set space_id=p_space_id,folder_id=p_folder_id where id=material.id returning * into material;
  update public.study_sets set space_id=p_space_id,updated_at=now() where owner_id=p_owner_id and material_id=material.id;
  return jsonb_build_object('status','ok','materialId',material.id,'spaceId',material.space_id,'folderId',material.folder_id,'revision',material.location_revision);
end $$;

revoke all on function public.create_space_folder(uuid,uuid,uuid,text),public.rename_space_folder(uuid,uuid,integer,text),public.delete_space_folder(uuid,uuid,integer),public.move_space_folder(uuid,uuid,integer,uuid),public.move_material_location(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.create_space_folder(uuid,uuid,uuid,text),public.rename_space_folder(uuid,uuid,integer,text),public.delete_space_folder(uuid,uuid,integer),public.move_space_folder(uuid,uuid,integer,uuid),public.move_material_location(uuid,uuid,uuid,uuid,integer) to service_role;