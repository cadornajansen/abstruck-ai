create or replace function public.checkpoint_chat_search(p_owner_id uuid,p_request_id uuid,p_evidence jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; answer public.messages;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  select * into answer from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='assistant' for update;
  if entry.id is null or answer.id is null or answer.preferences->>'webSearch' is distinct from 'true' then raise exception 'request_missing'; end if;
  if (jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>8192 or
    jsonb_typeof(p_evidence->'sources')<>'array' or jsonb_array_length(p_evidence->'sources') not between 1 and 5 or
    jsonb_typeof(p_evidence->'text')<>'string' or
    exists(select 1 from jsonb_array_elements(p_evidence->'sources') s where
      jsonb_typeof(s->'url')<>'string' or length(s->>'url')>2048 or
      (s->>'url') !~ '^https://[^/@[:space:]]+(/|[?#]|$)' or
      jsonb_typeof(s->'title')<>'string' or length(s->>'title')>160) or
    jsonb_typeof(p_usage)<>'object' or jsonb_typeof(p_usage->'id')<>'string' or (p_usage->>'input_tokens')::integer<0 or (p_usage->>'output_tokens')::integer<0 or p_usage->>'model' not like 'gpt-4o-mini%' or
    (p_usage->>'tool_calls')::integer<>1 or (p_usage->>'output_tokens')::integer>512 or
    (p_usage->>'cost_usd')::numeric not between 0 and 0.0139648 ) is not false then raise exception 'invalid_search_evidence'; end if;
  if entry.provider_usage ? 'search' then
    if entry.provider_usage->'search'<>p_usage or entry.provider_usage->'search_evidence'<>p_evidence then raise exception 'search_conflict'; end if;
  else
    update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object('search',p_usage,'search_evidence',p_evidence),
      cost_usd=(p_usage->>'cost_usd')::numeric,input_tokens=(p_usage->>'input_tokens')::integer,
      output_tokens=(p_usage->>'output_tokens')::integer,updated_at=now() where id=p_request_id;
  end if;
  return entry.status='reserved' and answer.state='pending';
end $$;
