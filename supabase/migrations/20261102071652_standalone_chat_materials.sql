alter table public.materials drop constraint materials_source_type_check;
alter table public.materials add constraint materials_source_type_check check(source_type in ('pdf','text','docx','pptx','audio','video','youtube','chat'));
alter table public.materials add constraint materials_standalone_chat_check check(source_type<>'chat' or (space_id is null and status='ready'));
alter table public.messages drop constraint messages_state_check;
alter table public.messages add constraint messages_state_check check(state in ('queued','pending','complete','stopped','interrupted','failed'));

create function public.create_standalone_chat(p_owner_id uuid,p_request_id uuid,p_question text,p_source_ids uuid[] default '{}')
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

create or replace function public.reserve_chat_request(p_owner_id uuid,p_material_id uuid,p_conversation_id uuid,p_source_ids uuid[],p_request_id uuid,p_question text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account_context jsonb; v_period_id uuid; v_conversation_id uuid; versions jsonb; existing public.usage_ledger;
  source_kind text; source_count integer; queued_question public.messages;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if p_request_id is null or coalesce(length(btrim(p_question)),0) not between 1 and 2000 then raise exception 'invalid_question'; end if;
  select source_type into source_kind from public.materials where id=p_material_id and owner_id=p_owner_id and status in('ready','partial');
  if not found then raise exception 'material_not_ready'; end if;
  p_source_ids:=coalesce(p_source_ids,'{}');
  source_count:=cardinality(p_source_ids);
  if source_count>3 or (source_kind<>'chat' and source_count=0) or
    (select count(distinct x) from unnest(p_source_ids) x)<>source_count then raise exception 'invalid_sources'; end if;
  select coalesce(jsonb_object_agg(id::text,extraction_version),'{}') into versions from public.materials
    where id=any(p_source_ids) and owner_id=p_owner_id and source_type<>'chat' and status in('ready','partial');
  if (select count(*) from jsonb_each(versions))<>source_count then raise exception 'source_unavailable'; end if;
  select * into existing from public.usage_ledger where id=p_request_id;
  if found then
    select m.conversation_id into v_conversation_id from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.owner_id=p_owner_id and m.request_id=p_request_id and m.role='user' and m.content=btrim(p_question)
      and m.source_versions=versions and c.material_id=p_material_id and (p_conversation_id is null or c.id=p_conversation_id);
    if existing.owner_id<>p_owner_id or v_conversation_id is null then raise exception 'request_conflict'; end if;
    return jsonb_build_object('existing',true,'status',existing.status,'conversationId',v_conversation_id);
  end if;
  select * into queued_question from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='user' for update;
  if found then
    if source_kind<>'chat' or queued_question.state<>'queued' or queued_question.content<>btrim(p_question) or queued_question.source_versions<>versions or
      not exists(select 1 from public.conversations where id=queued_question.conversation_id and material_id=p_material_id and owner_id=p_owner_id) or
      (p_conversation_id is not null and queued_question.conversation_id<>p_conversation_id) then raise exception 'request_conflict'; end if;
    v_conversation_id:=queued_question.conversation_id;
  elsif p_conversation_id is null then
    insert into public.conversations(owner_id,material_id,title) values(p_owner_id,p_material_id,left(btrim(p_question),80)) returning id into v_conversation_id;
  else
    select id into v_conversation_id from public.conversations where id=p_conversation_id and owner_id=p_owner_id and material_id=p_material_id for update;
    if not found then raise exception 'conversation_missing'; end if;
  end if;
  update public.usage_ledger l set status='uncertain',updated_at=now() where l.owner_id=p_owner_id and l.feature='chat' and l.status='reserved'
    and l.created_at<now()-interval '3 minutes' and exists(select 1 from public.messages m where m.request_id=l.id and m.conversation_id=v_conversation_id);
  update public.messages m set state='interrupted' where m.conversation_id=v_conversation_id and m.state='pending'
    and exists(select 1 from public.usage_ledger l where l.id=m.request_id and l.status='uncertain');
  if exists(select 1 from public.messages m where m.conversation_id=v_conversation_id and m.role='user' and
    (m.state='pending' or (m.state='queued' and m.request_id<>p_request_id))) then raise exception 'answer_in_progress'; end if;
  account_context:=public.billing_account_context(p_owner_id);
  if public.billing_active_operations(p_owner_id)>=(account_context->'limits'->>'concurrentJobs')::integer then raise exception 'answer_in_progress'; end if;
  v_period_id:=(account_context->>'periodId')::uuid;
  if (select count(*) from public.usage_ledger l where l.period_id=v_period_id and l.feature='chat' and l.status<>'failed')>=(account_context->'limits'->>'chatMessages')::integer then raise exception 'chat_quota_exceeded'; end if;
  delete from public.conversation_sources where conversation_sources.conversation_id=v_conversation_id;
  insert into public.conversation_sources(conversation_id,owner_id,material_id,extraction_version)
    select v_conversation_id,p_owner_id,key::uuid,value::integer from jsonb_each_text(versions);
  if queued_question.id is not null then
    update public.messages set state='pending' where owner_id=p_owner_id and request_id=p_request_id and state='queued';
  else
    insert into public.messages(conversation_id,owner_id,request_id,role,content,state,source_versions)
      values(v_conversation_id,p_owner_id,p_request_id,'user',btrim(p_question),'pending',versions),
        (v_conversation_id,p_owner_id,p_request_id,'assistant','','pending',versions);
  end if;
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(p_request_id,p_owner_id,v_period_id,'chat','reserved');
  update public.conversations set updated_at=now() where id=v_conversation_id;
  return jsonb_build_object('existing',false,'status','reserved','conversationId',v_conversation_id);
end $$;

create function public.fail_queued_chat_request(p_owner_id uuid,p_material_id uuid,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if exists(select 1 from public.usage_ledger where id=p_request_id) or not exists
    (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.owner_id=p_owner_id and
      m.request_id=p_request_id and m.role='user' and m.state='queued' and c.material_id=p_material_id) then return false; end if;
  update public.messages set state='failed' where owner_id=p_owner_id and request_id=p_request_id and state='queued';
  return found;
end $$;

create or replace function public.stop_chat_request(p_owner_id uuid,p_material_id uuid,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  perform 1 from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  if not found then
    if not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.request_id=p_request_id and m.owner_id=p_owner_id and m.role='user' and m.state='queued' and c.material_id=p_material_id) then return false; end if;
    update public.messages set state='stopped' where owner_id=p_owner_id and request_id=p_request_id and state='queued';
    return true;
  end if;
  if not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.request_id=p_request_id and m.owner_id=p_owner_id and c.material_id=p_material_id) then return false; end if;
  update public.messages set state='stopped' where owner_id=p_owner_id and request_id=p_request_id and state in('pending','interrupted');
  update public.usage_ledger set status='uncertain',updated_at=now() where id=p_request_id and status='reserved';
  return true;
end $$;

revoke all on function public.create_standalone_chat(uuid,uuid,text,uuid[]),public.fail_queued_chat_request(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_standalone_chat(uuid,uuid,text,uuid[]),public.fail_queued_chat_request(uuid,uuid,uuid) to service_role;
