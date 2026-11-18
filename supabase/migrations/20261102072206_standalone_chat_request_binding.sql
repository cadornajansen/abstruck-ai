create unique index materials_chat_request_id_key on public.materials(request_id) where source_type='chat';

create or replace function public.create_standalone_chat(p_owner_id uuid,p_request_id uuid,p_question text,p_source_ids uuid[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare source public.materials; question public.messages; conversation uuid; versions jsonb; source_count integer;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_request_id is null or coalesce(length(btrim(p_question)),0) not between 1 and 2000 then raise exception 'invalid_question'; end if;
  p_source_ids:=coalesce(p_source_ids,'{}');
  source_count:=cardinality(p_source_ids);
  if source_count>3 or (select count(distinct x) from unnest(p_source_ids) x)<>source_count then raise exception 'invalid_sources'; end if;
  select * into source from public.materials where owner_id=p_owner_id and request_id=p_request_id for update;
  if found then
    select m.* into question from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.owner_id=p_owner_id and m.request_id=p_request_id and m.role='user' and c.material_id=source.id;
    if source.source_type<>'chat' or question.id is null or question.content<>btrim(p_question) or
      (select count(*) from jsonb_object_keys(question.source_versions))<>source_count or
      exists(select 1 from jsonb_object_keys(question.source_versions) k where not(k::uuid=any(p_source_ids))) then raise exception 'request_conflict'; end if;
    return jsonb_build_object('materialId',source.id,'conversationId',question.conversation_id);
  end if;
  if exists(select 1 from public.materials where request_id=p_request_id and owner_id<>p_owner_id) then raise exception 'request_conflict'; end if;
  if exists(select 1 from public.usage_ledger where id=p_request_id) or exists(select 1 from public.messages where owner_id=p_owner_id and request_id=p_request_id)
    then raise exception 'request_conflict'; end if;
  select coalesce(jsonb_object_agg(id::text,extraction_version),'{}') into versions from public.materials
    where id=any(p_source_ids) and owner_id=p_owner_id and source_type<>'chat' and status in('ready','partial');
  if (select count(*) from jsonb_each(versions))<>source_count then raise exception 'source_unavailable'; end if;
  insert into public.materials(owner_id,space_id,request_id,title,source_type,status)
    values(p_owner_id,null,p_request_id,left(regexp_replace(btrim(p_question),'\s+',' ','g'),120),'chat','ready') returning * into source;
  insert into public.conversations(owner_id,material_id,title) values(p_owner_id,source.id,left(source.title,80)) returning id into conversation;
  insert into public.conversation_sources(conversation_id,owner_id,material_id,extraction_version)
    select conversation,p_owner_id,key::uuid,value::integer from jsonb_each_text(versions);
  insert into public.messages(conversation_id,owner_id,request_id,role,content,state,source_versions)
    values(conversation,p_owner_id,p_request_id,'user',btrim(p_question),'queued',versions),
      (conversation,p_owner_id,p_request_id,'assistant','','queued',versions);
  return jsonb_build_object('materialId',source.id,'conversationId',conversation);
end $$;

