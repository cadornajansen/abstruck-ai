alter table public.messages add column web_sources jsonb not null default '[]' check(jsonb_typeof(web_sources)='array');
alter table public.usage_ledger add column provider_usage jsonb not null default '{}' check(jsonb_typeof(provider_usage)='object');

create function public.checkpoint_chat_search(p_owner_id uuid,p_request_id uuid,p_evidence jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; answer public.messages;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  select * into answer from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='assistant' for update;
  if entry.id is null or answer.id is null or answer.preferences->>'webSearch'<>'true' then raise exception 'request_missing'; end if;
  if jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>8192 or
    jsonb_typeof(p_evidence->'sources')<>'array' or jsonb_array_length(p_evidence->'sources') not between 1 and 5 or
    jsonb_typeof(p_evidence->'text')<>'string' or
    exists(select 1 from jsonb_array_elements(p_evidence->'sources') s where
      jsonb_typeof(s->'url')<>'string' or length(s->>'url')>2048 or
      (s->>'url') !~ '^https://[^/@[:space:]]+(/|[?#]|$)' or
      jsonb_typeof(s->'title')<>'string' or length(s->>'title')>160) or
    jsonb_typeof(p_usage)<>'object' or p_usage->>'model' not like 'gpt-4o-mini%' or
    (p_usage->>'tool_calls')::integer<>1 or (p_usage->>'output_tokens')::integer>512 or
    (p_usage->>'cost_usd')::numeric not between 0 and 0.0139648 then raise exception 'invalid_search_evidence'; end if;
  if entry.provider_usage ? 'search' then
    if entry.provider_usage->'search'<>p_usage or entry.provider_usage->'search_evidence'<>p_evidence then raise exception 'search_conflict'; end if;
  else
    update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object('search',p_usage,'search_evidence',p_evidence),
      cost_usd=(p_usage->>'cost_usd')::numeric,input_tokens=(p_usage->>'input_tokens')::integer,
      output_tokens=(p_usage->>'output_tokens')::integer,updated_at=now() where id=p_request_id;
  end if;
  return entry.status='reserved' and answer.state='pending';
end $$;

alter function public.settle_chat_request(uuid,uuid,text,text,jsonb,jsonb) rename to settle_chat_before_web;

create function public.settle_chat_request(p_owner_id uuid,p_request_id uuid,p_state text,p_text text,p_citations jsonb,p_usage jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; question public.messages; search_usage jsonb; answer_usage jsonb; combined jsonb;
  sources jsonb; final_state text;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  select * into question from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='user' for update;
  if entry.id is null or question.id is null then raise exception 'request_missing'; end if;
  if question.state='complete' then return 'complete'; end if;
  sources:=coalesce(p_usage->'web_sources','[]'::jsonb);
  if jsonb_typeof(sources)<>'array' or jsonb_array_length(sources)>5 or
    exists(select 1 from jsonb_array_elements(sources) s where not
      coalesce(entry.provider_usage->'search_evidence'->'sources','[]'::jsonb) @> jsonb_build_array(s)) or
    (jsonb_array_length(sources)>0 and question.preferences->>'webSearch'<>'true') then raise exception 'invalid_web_citation'; end if;
  search_usage:=coalesce(entry.provider_usage->'search',p_usage->'search','{}'::jsonb);
  answer_usage:=p_usage-'search'-'web_sources';
  combined:=jsonb_build_object(
    'id',coalesce(answer_usage->>'id',search_usage->>'id'),
    'model',coalesce(answer_usage->>'model',question.preferences->>'actualModel'),
    'input_tokens',case when answer_usage->>'input_tokens' is null and search_usage->>'input_tokens' is null then null else
      coalesce((answer_usage->>'input_tokens')::integer,0)+coalesce((search_usage->>'input_tokens')::integer,0) end,
    'output_tokens',case when answer_usage->>'output_tokens' is null and search_usage->>'output_tokens' is null then null else
      coalesce((answer_usage->>'output_tokens')::integer,0)+coalesce((search_usage->>'output_tokens')::integer,0) end,
    'cost_usd',case when answer_usage->>'cost_usd' is null and search_usage->>'cost_usd' is null then null else
      coalesce((answer_usage->>'cost_usd')::numeric,0)+coalesce((search_usage->>'cost_usd')::numeric,0) end);
  final_state:=public.settle_chat_before_web(p_owner_id,p_request_id,p_state,p_text,p_citations,combined);
  update public.messages set content=left(p_text,14000),web_sources=case when final_state='complete' then sources else '[]'::jsonb end
    where owner_id=p_owner_id and request_id=p_request_id and role='assistant';
  update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object('search',search_usage,'answer',answer_usage)
    where id=p_request_id;
  return final_state;
end $$;

create or replace function public.checkpoint_chat(p_owner_id uuid,p_request_id uuid,p_text text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  if not found or entry.status<>'reserved' then return false; end if;
  update public.messages set content=left(p_text,14000) where owner_id=p_owner_id and request_id=p_request_id and role='assistant' and state='pending';
  return found;
end $$;

revoke all on function public.checkpoint_chat_search(uuid,uuid,jsonb,jsonb),public.settle_chat_request(uuid,uuid,text,text,jsonb,jsonb),
  public.settle_chat_before_web(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_chat_search(uuid,uuid,jsonb,jsonb),public.settle_chat_request(uuid,uuid,text,text,jsonb,jsonb),
  public.settle_chat_before_web(uuid,uuid,text,text,jsonb,jsonb) to service_role;
