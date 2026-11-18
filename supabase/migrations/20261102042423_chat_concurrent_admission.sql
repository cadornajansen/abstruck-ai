create or replace function public.reserve_chat_request(p_owner_id uuid,p_material_id uuid,p_conversation_id uuid,p_source_ids uuid[],p_request_id uuid,p_question text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account_context jsonb; v_period_id uuid; v_conversation_id uuid; versions jsonb; existing public.usage_ledger;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if length(btrim(p_question)) not between 1 and 2000 then raise exception 'invalid_question'; end if;
  if not exists(select 1 from public.materials where id=p_material_id and owner_id=p_owner_id and status in('ready','partial')) then raise exception 'material_not_ready'; end if;
  if coalesce(array_length(p_source_ids,1),0) not between 1 and 3
    or (select count(distinct x) from unnest(p_source_ids) x)<>array_length(p_source_ids,1) then raise exception 'invalid_sources'; end if;
  select jsonb_object_agg(id::text,extraction_version) into versions from public.materials
    where id=any(p_source_ids) and owner_id=p_owner_id and status in('ready','partial');
  if (select count(*) from jsonb_each(versions))<>array_length(p_source_ids,1) then raise exception 'source_unavailable'; end if;
  select * into existing from public.usage_ledger where id=p_request_id;
  if found then
    select m.conversation_id into v_conversation_id from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.owner_id=p_owner_id and m.request_id=p_request_id and m.role='user' and m.content=btrim(p_question)
      and m.source_versions=versions and c.material_id=p_material_id
      and (p_conversation_id is null or c.id=p_conversation_id);
    if existing.owner_id<>p_owner_id or v_conversation_id is null then raise exception 'request_conflict'; end if;
    return jsonb_build_object('existing',true,'status',existing.status,'conversationId',v_conversation_id);
  end if;
  if p_conversation_id is null then
    insert into public.conversations(owner_id,material_id,title) values(p_owner_id,p_material_id,left(btrim(p_question),80)) returning id into v_conversation_id;
  else
    select id into v_conversation_id from public.conversations where id=p_conversation_id and owner_id=p_owner_id and material_id=p_material_id for update;
    if not found then raise exception 'conversation_missing'; end if;
  end if;
  -- A dead HTTP request must not prevent later questions indefinitely. Unknown provider cost is retained.
  update public.usage_ledger l set status='uncertain',updated_at=now() where l.owner_id=p_owner_id and l.feature='chat' and l.status='reserved'
    and l.created_at<now()-interval '3 minutes' and exists(select 1 from public.messages m where m.request_id=l.id and m.conversation_id=v_conversation_id);
  update public.messages m set state='interrupted' where m.conversation_id=v_conversation_id and m.state='pending'
    and exists(select 1 from public.usage_ledger l where l.id=m.request_id and l.status='uncertain');
  if exists(select 1 from public.messages m where m.conversation_id=v_conversation_id and m.role='user' and m.state='pending') then raise exception 'answer_in_progress'; end if;
  account_context:=public.billing_account_context(p_owner_id);
  if public.billing_active_operations(p_owner_id)>=(account_context->'limits'->>'concurrentJobs')::integer then raise exception 'answer_in_progress'; end if;
  v_period_id:=(account_context->>'periodId')::uuid;
  if (select count(*) from public.usage_ledger l where l.period_id=v_period_id and l.feature='chat' and l.status<>'failed')>=(account_context->'limits'->>'chatMessages')::integer then raise exception 'chat_quota_exceeded'; end if;
  delete from public.conversation_sources where conversation_sources.conversation_id=v_conversation_id;
  insert into public.conversation_sources(conversation_id,owner_id,material_id,extraction_version)
    select v_conversation_id,p_owner_id,key::uuid,value::integer from jsonb_each_text(versions);
  insert into public.messages(conversation_id,owner_id,request_id,role,content,state,source_versions)
    values(v_conversation_id,p_owner_id,p_request_id,'user',btrim(p_question),'pending',versions),
      (v_conversation_id,p_owner_id,p_request_id,'assistant','','pending',versions);
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(p_request_id,p_owner_id,v_period_id,'chat','reserved');
  update public.conversations set updated_at=now() where id=v_conversation_id;
  return jsonb_build_object('existing',false,'status','reserved','conversationId',v_conversation_id);
end $$;
