create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id,owner_id), unique (owner_id,material_id),
  foreign key (material_id,owner_id) references public.materials(id,owner_id) on delete cascade
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  owner_id uuid not null,
  request_id uuid not null,
  role text not null check(role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  unique(owner_id,request_id,role), unique(id,owner_id),
  foreign key(conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade
);
create index messages_conversation_created_idx on public.messages(conversation_id,created_at);
create table public.message_citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  owner_id uuid not null,
  source_segment_id uuid not null references public.source_segments(id),
  quote text not null,
  page integer not null,
  foreign key(message_id,owner_id) references public.messages(id,owner_id) on delete cascade
);
create index message_citations_message_idx on public.message_citations(message_id);
create index message_citations_owner_idx on public.message_citations(owner_id);
create index message_citations_segment_idx on public.message_citations(source_segment_id);
create table public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique(owner_id,starts_at)
);
create table public.usage_ledger (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.usage_periods(id),
  feature text not null,
  status text not null check(status in ('reserved','succeeded','failed','uncertain')),
  model text,
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(14,10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index usage_ledger_period_idx on public.usage_ledger(period_id,feature,status);
create index usage_ledger_owner_idx on public.usage_ledger(owner_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_citations enable row level security;
alter table public.usage_periods enable row level security;
alter table public.usage_ledger enable row level security;
create policy conversations_read_own on public.conversations for select to authenticated using ((select auth.uid())=owner_id);
create policy messages_read_own on public.messages for select to authenticated using ((select auth.uid())=owner_id);
create policy citations_read_own on public.message_citations for select to authenticated using ((select auth.uid())=owner_id);
create policy periods_read_own on public.usage_periods for select to authenticated using ((select auth.uid())=owner_id);
create policy ledger_read_own on public.usage_ledger for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.conversations,public.messages,public.message_citations,public.usage_periods,public.usage_ledger from anon,authenticated;
grant select on public.conversations,public.messages,public.message_citations,public.usage_periods,public.usage_ledger to authenticated;
grant all on public.conversations,public.messages,public.message_citations,public.usage_periods,public.usage_ledger to service_role;

create function public.reserve_chat(p_owner_id uuid,p_material_id uuid,p_request_id uuid,p_question text,p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile_created timestamptz; period_start timestamptz; period uuid; conversation uuid; existing public.usage_ledger;
begin
  select created_at into profile_created from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if not exists(select 1 from public.materials where id=p_material_id and owner_id=p_owner_id and status in ('ready','partial')) then raise exception 'material_not_ready'; end if;
  select * into existing from public.usage_ledger where id=p_request_id;
  if found then
    if existing.owner_id<>p_owner_id or not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.owner_id=p_owner_id and m.request_id=p_request_id and m.role='user' and m.content=p_question and c.material_id=p_material_id)
      then raise exception 'request_conflict'; end if;
    return jsonb_build_object('existing',true,'status',existing.status);
  end if;
  period_start := profile_created + floor(extract(epoch from (now()-profile_created))/2592000)::integer * interval '30 days';
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(p_owner_id,period_start,period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into period;
  if (select count(*) from public.usage_ledger where period_id=period and feature='chat' and status<>'failed') >= p_limit then raise exception 'chat_quota_exceeded'; end if;
  insert into public.conversations(owner_id,material_id) values(p_owner_id,p_material_id)
    on conflict(owner_id,material_id) do update set owner_id=excluded.owner_id returning id into conversation;
  insert into public.messages(conversation_id,owner_id,request_id,role,content) values(conversation,p_owner_id,p_request_id,'user',p_question);
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(p_request_id,p_owner_id,period,'chat','reserved');
  return jsonb_build_object('existing',false,'status','reserved','conversationId',conversation);
end $$;

create function public.finish_chat(p_owner_id uuid,p_request_id uuid,p_answer text,p_citations jsonb,p_usage jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; user_message public.messages; assistant uuid;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id for update;
  if not found then raise exception 'request_missing'; end if;
  if entry.status='succeeded' then return (select id from public.messages where request_id=p_request_id and owner_id=p_owner_id and role='assistant'); end if;
  select * into user_message from public.messages where request_id=p_request_id and owner_id=p_owner_id and role='user';
  -- A quote must actually occur in a source belonging to this conversation.
  if exists(select 1 from jsonb_to_recordset(p_citations) as c(segment_id uuid,quote text,page integer)
    where not exists(select 1 from public.source_segments s join public.conversations conv on conv.material_id=s.material_id
      where s.id=c.segment_id and s.owner_id=p_owner_id and conv.id=user_message.conversation_id
      and s.ordinal=c.page and length(c.quote)>0 and strpos(s.text,c.quote)>0)) then raise exception 'invalid_citation'; end if;
  insert into public.messages(conversation_id,owner_id,request_id,role,content)
    values(user_message.conversation_id,p_owner_id,p_request_id,'assistant',p_answer) returning id into assistant;
  insert into public.message_citations(message_id,owner_id,source_segment_id,quote,page)
    select assistant,p_owner_id,c.segment_id,c.quote,c.page from jsonb_to_recordset(p_citations) as c(segment_id uuid,quote text,page integer);
  update public.usage_ledger set status='succeeded',model=p_usage->>'model',provider_response_id=p_usage->>'id',
    input_tokens=(p_usage->>'input_tokens')::integer,output_tokens=(p_usage->>'output_tokens')::integer,
    cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=p_request_id;
  return assistant;
end $$;
revoke all on function public.reserve_chat(uuid,uuid,uuid,text,integer),public.finish_chat(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_chat(uuid,uuid,uuid,text,integer),public.finish_chat(uuid,uuid,text,jsonb,jsonb) to service_role;
