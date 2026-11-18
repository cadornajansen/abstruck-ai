alter table public.conversations add column preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object');
alter table public.messages add column preferences jsonb not null default '{}'::jsonb check(jsonb_typeof(preferences)='object');

create function public.save_chat_preferences(p_owner_id uuid,p_material_id uuid,p_conversation_id uuid,p_preferences jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if jsonb_typeof(p_preferences) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(p_preferences))<>5 or
    coalesce(p_preferences->>'model','') not in('auto','gpt-6-luna','gpt-6-sol','gpt-6-astra') or
    coalesce(p_preferences->>'responseLength','') not in('concise','balanced','detailed') or
    jsonb_typeof(p_preferences->'studyMode') is distinct from 'boolean' or
    jsonb_typeof(p_preferences->'webSearch') is distinct from 'boolean' or
    jsonb_typeof(p_preferences->'instructions') is distinct from 'string' or
    length(p_preferences->>'instructions')>1000 then raise exception 'invalid_preferences'; end if;
  update public.conversations set preferences=p_preferences where id=p_conversation_id and material_id=p_material_id and owner_id=p_owner_id;
  if not found then raise exception 'conversation_missing'; end if;
  return p_preferences;
end $$;

create function public.reserve_configured_chat_request(p_owner_id uuid,p_material_id uuid,p_conversation_id uuid,p_source_ids uuid[],p_request_id uuid,p_question text,p_limit integer,p_configuration jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; prior jsonb; public_preferences jsonb; changed integer;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if jsonb_typeof(p_configuration) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(p_configuration))<>8 or
    coalesce(p_configuration->>'actualModel','') not in('gpt-6-luna','gpt-6-sol','gpt-6-astra') or
    jsonb_typeof(p_configuration->'maxOutputTokens') is distinct from 'number' or
    jsonb_typeof(p_configuration->'maxCostUsd') is distinct from 'number' then raise exception 'invalid_configuration'; end if;
  if (p_configuration->>'maxOutputTokens')::numeric not in(256,1600,3200) or
    (p_configuration->>'maxCostUsd')::numeric<=0 or (p_configuration->>'maxCostUsd')::numeric>1 then raise exception 'invalid_configuration'; end if;
  public_preferences:=p_configuration-'actualModel'-'maxOutputTokens'-'maxCostUsd';
  if coalesce(public_preferences->>'model','')<>'auto' and public_preferences->>'model'<>p_configuration->>'actualModel' then raise exception 'invalid_configuration'; end if;
  if public_preferences->>'model'='auto' and p_configuration->>'actualModel'<>'gpt-6-luna' then raise exception 'invalid_configuration'; end if;
  select m.preferences into prior from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.owner_id=p_owner_id and m.request_id=p_request_id and m.role='user' and c.material_id=p_material_id;
  if exists(select 1 from public.usage_ledger where id=p_request_id) and prior is not null and prior<>p_configuration then raise exception 'request_conflict'; end if;
  result:=public.reserve_chat_request(p_owner_id,p_material_id,p_conversation_id,p_source_ids,p_request_id,p_question,p_limit);
  if not (result->>'existing')::boolean then
    perform public.save_chat_preferences(p_owner_id,p_material_id,(result->>'conversationId')::uuid,public_preferences);
    update public.messages set preferences=p_configuration where owner_id=p_owner_id and request_id=p_request_id;
    get diagnostics changed=row_count;
    if changed<>2 then raise exception 'request_messages_missing'; end if;
  end if;
  return result;
end $$;

revoke all on function public.save_chat_preferences(uuid,uuid,uuid,jsonb),public.reserve_configured_chat_request(uuid,uuid,uuid,uuid[],uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_chat_preferences(uuid,uuid,uuid,jsonb),public.reserve_configured_chat_request(uuid,uuid,uuid,uuid[],uuid,text,integer,jsonb) to service_role;
