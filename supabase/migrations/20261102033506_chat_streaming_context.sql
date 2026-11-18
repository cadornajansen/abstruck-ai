alter table public.conversations drop constraint conversations_owner_id_material_id_key;
alter table public.conversations add column title text not null default 'New conversation';
alter table public.conversations add column updated_at timestamptz not null default now();
create index conversations_material_updated_idx on public.conversations(owner_id,material_id,updated_at desc);
update public.conversations c set title=coalesce((select left(m.content,80) from public.messages m
  where m.conversation_id=c.id and m.role='user' order by m.created_at limit 1),'New conversation');

alter table public.messages add column state text not null default 'complete'
  check(state in ('pending','complete','stopped','interrupted','failed'));
alter table public.messages add column source_versions jsonb not null default '{}';
update public.messages m set source_versions=coalesce((select jsonb_object_agg(s.material_id,s.extraction_version)
  from public.source_segments s join public.message_citations c on c.source_segment_id=s.id where c.message_id=m.id),'{}');

create table public.conversation_sources (
  conversation_id uuid not null,
  owner_id uuid not null,
  material_id uuid not null,
  extraction_version integer not null,
  primary key(conversation_id,material_id),
  foreign key(conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade,
  foreign key(material_id,owner_id) references public.materials(id,owner_id) on delete cascade
);
create index conversation_sources_owner_idx on public.conversation_sources(owner_id);
create index conversation_sources_material_idx on public.conversation_sources(material_id,owner_id);
alter table public.conversation_sources enable row level security;
create policy conversation_sources_read_own on public.conversation_sources for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.conversation_sources from public,anon,authenticated;
grant select on public.conversation_sources to authenticated;
grant all on public.conversation_sources to service_role;
insert into public.conversation_sources(conversation_id,owner_id,material_id,extraction_version)
  select c.id,c.owner_id,c.material_id,m.extraction_version from public.conversations c join public.materials m on m.id=c.material_id;

-- Retire the single-conversation entry point; web/worker use the versioned contract below.
revoke all on function public.reserve_chat(uuid,uuid,uuid,text,integer),public.finish_chat(uuid,uuid,text,jsonb,jsonb) from service_role;

create function public.reserve_chat_request(p_owner_id uuid,p_material_id uuid,p_conversation_id uuid,p_source_ids uuid[],p_request_id uuid,p_question text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile_created timestamptz; period_start timestamptz; v_period_id uuid; v_conversation_id uuid; versions jsonb; existing public.usage_ledger;
begin
  select created_at into profile_created from public.profiles where id=p_owner_id for update;
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
  period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(p_owner_id,period_start,period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into v_period_id;
  if (select count(*) from public.usage_ledger l where l.period_id=v_period_id and l.feature='chat' and l.status<>'failed')>=p_limit then raise exception 'chat_quota_exceeded'; end if;
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

create function public.checkpoint_chat(p_owner_id uuid,p_request_id uuid,p_text text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  if not found or entry.status<>'reserved' then return false; end if;
  update public.messages set content=left(p_text,4000) where owner_id=p_owner_id and request_id=p_request_id and role='assistant' and state='pending';
  return found;
end $$;

create function public.stop_chat_request(p_owner_id uuid,p_material_id uuid,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.usage_ledger l where l.id=p_request_id and l.owner_id=p_owner_id and l.feature='chat' for update;
  if not found then return false; end if;
  if not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.request_id=p_request_id and m.owner_id=p_owner_id and c.material_id=p_material_id) then return false; end if;
  update public.messages set state='stopped' where owner_id=p_owner_id and request_id=p_request_id and state in('pending','interrupted');
  update public.usage_ledger set status='uncertain',updated_at=now() where id=p_request_id and status='reserved';
  return true;
end $$;

create function public.settle_chat_request(p_owner_id uuid,p_request_id uuid,p_state text,p_text text,p_citations jsonb,p_usage jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; question public.messages; answer_id uuid; final_state text;
begin
  if p_state not in('complete','stopped','interrupted','failed') then raise exception 'invalid_state'; end if;
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  if not found then raise exception 'request_missing'; end if;
  select * into question from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='user' for update;
  if question.state='complete' then return 'complete'; end if;
  final_state:=case when question.state='stopped' then 'stopped' else p_state end;
  if final_state='complete' and exists(select 1 from jsonb_to_recordset(p_citations) as c(segment_id uuid,quote text,page integer)
    where not exists(select 1 from public.source_segments s join public.materials m on m.id=s.material_id
      where s.id=c.segment_id and s.owner_id=p_owner_id and m.owner_id=p_owner_id and m.status in('ready','partial')
        and s.extraction_version=m.extraction_version and question.source_versions->>s.material_id::text=s.extraction_version::text
        and s.ordinal=c.page and length(c.quote)>0 and strpos(s.text,c.quote)>0)) then raise exception 'invalid_citation'; end if;
  update public.messages set state=final_state where id=question.id;
  update public.messages set content=left(p_text,4000),state=final_state
    where owner_id=p_owner_id and request_id=p_request_id and role='assistant' returning id into answer_id;
  if final_state='complete' then
    insert into public.message_citations(message_id,owner_id,source_segment_id,quote,page)
      select answer_id,p_owner_id,c.segment_id,c.quote,c.page from jsonb_to_recordset(p_citations) c(segment_id uuid,quote text,page integer);
  end if;
  update public.usage_ledger set status=case when final_state='complete' then 'succeeded' when final_state='failed' then 'failed' else 'uncertain' end,
    model=coalesce(p_usage->>'model',model),provider_response_id=coalesce(p_usage->>'id',provider_response_id),
    input_tokens=coalesce((p_usage->>'input_tokens')::integer,input_tokens),output_tokens=coalesce((p_usage->>'output_tokens')::integer,output_tokens),
    cost_usd=coalesce((p_usage->>'cost_usd')::numeric,cost_usd),updated_at=now() where id=p_request_id;
  update public.conversations set updated_at=now() where id=question.conversation_id;
  return final_state;
end $$;

revoke all on function public.reserve_chat_request(uuid,uuid,uuid,uuid[],uuid,text,integer),public.checkpoint_chat(uuid,uuid,text),
  public.stop_chat_request(uuid,uuid,uuid),public.settle_chat_request(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_chat_request(uuid,uuid,uuid,uuid[],uuid,text,integer),public.checkpoint_chat(uuid,uuid,text),
  public.stop_chat_request(uuid,uuid,uuid),public.settle_chat_request(uuid,uuid,text,text,jsonb,jsonb) to service_role;
