-- Pending uploads reserve the actual bytes before issuing storage authorization.
alter table public.assets drop constraint assets_bytes_check;
alter table public.assets add constraint assets_bytes_check
  check(bytes >= 1 and bytes <= case when role='original' then 250000000 else 50000000 end);

create function public.reserve_file_material_upload(p_owner_id uuid,p_space_id uuid,p_folder_id uuid,
  p_request_id uuid,p_title text,p_bytes bigint,p_extension text,p_fingerprint text)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare material public.materials; account jsonb; kind text; mime text; requested jsonb;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_extension is null or p_extension not in ('pdf','docx','pptx','mp3','m4a','wav','ogg','mp4','mov','webm')
    or p_bytes is null or p_bytes < 1
    or p_bytes > (case when p_extension in ('pdf','docx','pptx') then 50000000 else 250000000 end)
    or p_title is null or char_length(p_title) not between 1 and 240
    or right(lower(p_title),char_length(p_extension)+1) <> '.'||p_extension
    or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    then raise exception 'invalid_file_source'; end if;
  kind:=case when p_extension in ('pdf','docx','pptx') then p_extension
    when p_extension in ('mp4','mov','webm') then 'video' else 'audio' end;
  mime:=case p_extension when 'pdf' then 'application/pdf'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    when 'mp3' then 'audio/mpeg' when 'm4a' then 'audio/mp4' when 'wav' then 'audio/wav'
    when 'ogg' then 'audio/ogg' when 'mp4' then 'video/mp4' when 'mov' then 'video/quicktime' else 'video/webm' end;
  requested:=jsonb_build_object('spaceId',p_space_id,'folderId',p_folder_id,'kind',kind,
    'title',p_title,'bytes',p_bytes,'extension',p_extension,'fingerprint',p_fingerprint);
  select * into material from public.materials where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if material.initial_folder_request is distinct from requested then raise exception 'request_conflict'; end if;
    return material;
  end if;
  if p_space_id is not null then
    perform 1 from public.spaces where id=p_space_id and owner_id=p_owner_id for key share;
    if not found then raise exception 'space_not_found'; end if;
  end if;
  if p_folder_id is not null then
    perform 1 from public.folders where id=p_folder_id and space_id=p_space_id and owner_id=p_owner_id for key share;
    if not found then raise exception 'folder_not_found'; end if;
  end if;
  account:=public.billing_account_context(p_owner_id);
  if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)+p_bytes > (account->'limits'->>'storageBytes')::bigint
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id,space_id,folder_id,request_id,title,source_type,initial_folder_request)
    values(p_owner_id,p_space_id,p_folder_id,p_request_id,p_title,kind,requested) returning * into material;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes,metadata)
    values(material.id,p_owner_id,p_owner_id::text||'/'||material.id::text||'/original.'||p_extension,
      mime,p_bytes,jsonb_build_object('fileFingerprint',p_fingerprint));
  return material;
end $$;
revoke all on function public.reserve_file_material_upload(uuid,uuid,uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.reserve_file_material_upload(uuid,uuid,uuid,uuid,text,bigint,text,text) to service_role;
