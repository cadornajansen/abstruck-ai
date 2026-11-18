create function public.reserve_material_in_folder(p_owner_id uuid,p_space_id uuid,p_folder_id uuid,p_request_id uuid,p_kind text,
  p_title text default null,p_bytes bigint default null,p_extension text default null,p_sha256 text default null,p_video_id text default null)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare material public.materials; fingerprint jsonb;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_folder_id is null or p_space_id is null or p_kind not in ('pdf','docx','pptx','text','audio','video','youtube') then raise exception 'invalid_folder_import'; end if;
  fingerprint:=jsonb_build_object('spaceId',p_space_id,'folderId',p_folder_id,'kind',p_kind,'title',p_title,'bytes',p_bytes,'extension',p_extension,'sha256',p_sha256,'videoId',p_video_id);
  select * into material from public.materials where owner_id=p_owner_id and request_id=p_request_id for update;
  if found then
    if material.initial_folder_request<>fingerprint or material.source_type<>p_kind then raise exception 'request_conflict'; end if;
    if p_kind='youtube' then material:=public.queue_material(p_owner_id,material.id,true); end if;
    return material;
  end if;
  perform 1 from public.folders where id=p_folder_id and owner_id=p_owner_id and space_id=p_space_id for key share;
  if not found then raise exception 'folder_not_found'; end if;
  if p_kind='pdf' then material:=public.reserve_material_upload(p_owner_id,p_space_id,p_request_id,p_title,p_bytes,100000000);
  elsif p_kind in ('docx','pptx') then material:=public.reserve_office_material_upload(p_owner_id,p_space_id,p_request_id,p_title,p_bytes,p_kind,100000000);
  elsif p_kind in ('audio','video') then material:=public.reserve_media_material_upload(p_owner_id,p_space_id,p_request_id,p_title,p_bytes,p_extension);
  elsif p_kind='text' then material:=public.reserve_text_material(p_owner_id,p_space_id,p_request_id,p_title,p_bytes,p_sha256,100000000);
  else material:=public.reserve_youtube_material(p_owner_id,p_space_id,p_request_id,p_video_id); end if;
  if material.source_type<>p_kind then raise exception 'request_conflict'; end if;
  update public.materials set folder_id=p_folder_id,initial_folder_request=fingerprint where id=material.id returning * into material;
  return material;
end $$;

revoke all on function public.reserve_material_in_folder(uuid,uuid,uuid,uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_material_in_folder(uuid,uuid,uuid,uuid,text,text,bigint,text,text,text) to service_role;