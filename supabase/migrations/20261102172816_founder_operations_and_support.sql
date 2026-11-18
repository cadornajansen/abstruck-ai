create table public.admin_audit_events (
  id uuid primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_type text not null check(target_type in('job','order')),
  target_id uuid not null,
  action text not null check(action in('retry_job','reconcile_payment')),
  status text not null default 'started' check(status in('started','succeeded','failed','uncertain')),
  details jsonb not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_audit_events_created_idx on public.admin_audit_events(created_at desc);
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public,anon,authenticated;
grant all on public.admin_audit_events to service_role;

create function public.operations_retry_safety(p_job_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare job public.processing_jobs; run public.generation_runs; media public.transcription_runs; reason text;
begin
  select * into job from public.processing_jobs where id=p_job_id;
  if not found then return jsonb_build_object('allowed',false,'reason','job_unavailable'); end if;
  select * into run from public.generation_runs where job_id=job.id;
  select * into media from public.transcription_runs where job_id=job.id;
  if job.state<>'failed' then reason:='Only failed jobs can be retried.';
  elsif not exists(select 1 from public.profiles where id=job.owner_id) or exists
    (select 1 from public.account_data_requests where owner_id=job.owner_id and kind='deletion') then reason:='The owner account is unavailable.';
  elsif job.material_id is not null and not exists(select 1 from public.materials where id=job.material_id and deleted_at is null) then reason:='The source was deleted.';
  elsif job.study_set_id is not null and exists(select 1 from public.study_sets where id=job.study_set_id and source_unavailable) then reason:='A source for this output was deleted.';
  elsif job.attempt>=3 and media.submitted_at is null then reason:='The existing retry limit was reached. Review the source or create a new explicit generation.';
  elsif run.id is not null and run.output is null and job.attempt>0 then reason:='The prior provider result is unavailable. This request will not be dispatched again.';
  elsif job.input->'media'->>'state' in('submitting','uncertain') then reason:='Narration delivery is unconfirmed. Reconcile it before retrying.';
  elsif media.submitted_at is not null and media.provider_id is null and media.output is null then reason:='Transcription submission is unconfirmed. Reconcile it before retrying.';
  elsif job.input->'source_index'->'batch'->>'state' in('submitted','uncertain') then reason:='Embedding delivery is unconfirmed. Reconcile it before retrying.';
  elsif exists(select 1 from jsonb_each(coalesce(job.input->'ocr','{}')) page
    where page.value->>'state' in('submitting','submitted','uncertain') and page.value->'output' is null) then reason:='An OCR page result is unconfirmed. It will not be dispatched again.';
  end if;
  return jsonb_build_object('allowed',reason is null,'reason',reason);
end $$;

create function public.operations_begin_action(p_actor_id uuid,p_request_id uuid,p_action text,p_target_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare audit public.admin_audit_events; target text;
begin
  if p_request_id is null or p_action is null or p_action not in('retry_job','reconcile_payment') then raise exception 'invalid_request'; end if;
  target:=case when p_action='retry_job' then 'job' else 'order' end;
  insert into public.admin_audit_events(id,actor_id,target_type,target_id,action)
    values(p_request_id,p_actor_id,target,p_target_id,p_action) on conflict(id) do nothing returning * into audit;
  if not found then
    select * into audit from public.admin_audit_events where id=p_request_id;
    if audit.actor_id is distinct from p_actor_id or audit.action<>p_action or audit.target_id<>p_target_id then raise exception 'request_conflict'; end if;
  end if;
  return to_jsonb(audit);
end $$;

create function public.operations_finish_action(p_request_id uuid,p_status text,p_details jsonb,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in('succeeded','failed','uncertain') then raise exception 'invalid_status'; end if;
  update public.admin_audit_events set status=p_status,details=p_details,error_code=left(p_error,100),updated_at=now() where id=p_request_id;
  return found;
end $$;

create function public.operations_retry_job(p_actor_id uuid,p_job_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; audit jsonb; safety jsonb; account jsonb; message bigint; queue text; result jsonb;
begin
  select * into job from public.processing_jobs where id=p_job_id;
  perform 1 from public.profiles where id in(p_actor_id,job.owner_id) order by id for update;
  audit:=public.operations_begin_action(p_actor_id,p_request_id,'retry_job',p_job_id);
  if audit->>'status'<>'started' then return audit->'details'; end if;
  if job.id is not null then
    perform 1 from public.profiles where id=job.owner_id for update;
    select * into job from public.processing_jobs where id=p_job_id for update;
  end if;
  safety:=public.operations_retry_safety(p_job_id);
  if (safety->>'allowed')::boolean then
    account:=public.billing_account_context(job.owner_id);
    if public.billing_active_operations(job.owner_id,true)>=(account->'limits'->>'concurrentJobs')::integer then
      safety:=jsonb_build_object('allowed',false,'reason','The owner is already at the concurrent-job allowance.');
    end if;
  end if;
  if not(safety->>'allowed')::boolean then
    result:=jsonb_build_object('jobId',p_job_id,'state',coalesce(job.state,'unavailable'),'auditId',p_request_id,'blocked',true,'error',safety->>'reason');
    perform public.operations_finish_action(p_request_id,'failed',result,'retry_blocked'); return result;
  end if;
  queue:=case when job.material_id is not null then 'material_jobs' else 'study_jobs' end;
  select pgmq.send(queue,jsonb_build_object('job_id',job.id)) into message;
  -- Same business job and claim path; preserve attempt, usage rows, inputs and provider markers.
  update public.processing_jobs set state='queued',message_id=message,lease_token=null,lease_until=null,updated_at=now() where id=job.id;
  if job.material_id is not null and job.kind<>'index_material' then update public.materials set status='queued',error_code=null,updated_at=now() where id=job.material_id; end if;
  if job.study_set_id is not null then update public.study_sets set status='queued',error_code=null,updated_at=now() where id=job.study_set_id; end if;
  result:=jsonb_build_object('jobId',job.id,'state','queued','auditId',p_request_id);
  perform public.operations_finish_action(p_request_id,'succeeded',result); return result;
end $$;

create function public.operations_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare jobs jsonb; payments jsonb; audit jsonb; costs jsonb; counts jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'ownerId',j.owner_id,'kind',j.kind,'state',j.state,'attempt',j.attempt,
    'targetKind',case when j.material_id is not null then 'material' when j.study_set_id is not null then 'study-set' else 'attempt' end,
    'targetId',coalesce(j.material_id,j.study_set_id,j.attempt_id),'createdAt',j.created_at,'updatedAt',j.updated_at,'leaseUntil',j.lease_until,
    'errorCode',j.error_code,'retryAllowed',(safety->>'allowed')::boolean,'retryReason',safety->>'reason') order by j.updated_at desc),'[]') into jobs
    from (select * from public.processing_jobs order by updated_at desc limit 50) j cross join lateral public.operations_retry_safety(j.id) safety;
  select jsonb_build_object('queued',count(*)filter(where state='queued'),'running',count(*)filter(where state='running'),
    'waiting',count(*)filter(where state='waiting_provider'),'failed',count(*)filter(where state='failed')) into counts from public.processing_jobs;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'ownerId',owner_id,'state',state,'amount',amount,'currency',currency,
    'testMode',not livemode,'createdAt',created_at,'updatedAt',updated_at,'errorCode',error_code,'reconcileAllowed',not livemode and checkout_id is not null) order by updated_at desc),'[]')
    into payments from(select * from public.payment_orders order by updated_at desc limit 30)p;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'actorId',actor_id,'targetType',target_type,'targetId',target_id,'action',action,
    'status',status,'errorCode',error_code,'createdAt',created_at) order by created_at desc),'[]') into audit
    from(select * from public.admin_audit_events order by created_at desc limit 30)a;
  select jsonb_build_object('windowHours',24,'actualUsd',coalesce(sum(cost_usd),0),'reservedUsd',coalesce(sum(reserved_cost_usd)filter(where status='reserved'),0),
    'inputTokens',coalesce(sum(input_tokens),0),'outputTokens',coalesce(sum(output_tokens),0),'byFeature',
    (select coalesce(jsonb_agg(jsonb_build_object('feature',feature,'actualUsd',actual,'requests',requests)),'[]') from
      (select feature,coalesce(sum(cost_usd),0) actual,count(*) requests from public.usage_ledger where created_at>=now()-interval '24 hours' group by feature) f))
    into costs from public.usage_ledger where created_at>=now()-interval '24 hours';
  return jsonb_build_object('generatedAt',now(),'jobs',jobs,'jobCounts',counts,'payments',payments,'audit',audit,'costs',costs);
end $$;

create table public.notification_deliveries (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null unique,
  template text not null default 'support_request' check(template='support_request'),
  state text not null default 'queued' check(state in('queued','sending','sent','failed','uncertain')),
  payload jsonb not null,
  payload_hash text,
  provider_id text,
  provider_started_at timestamptz,
  error_code text,
  attempt integer not null default 0,
  message_id bigint,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_owner_created_idx on public.notification_deliveries(owner_id,created_at desc);
alter table public.notification_deliveries enable row level security;
create policy notification_receipt_own on public.notification_deliveries for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.account_is_active()));
revoke all on public.notification_deliveries from public,anon,authenticated;
grant select(id,owner_id,state,created_at,sent_at,error_code) on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;
select pgmq.create('notification_jobs');
grant all on pgmq.q_notification_jobs,pgmq.a_notification_jobs to service_role;
grant usage,select on sequence pgmq.q_notification_jobs_msg_id_seq to service_role;

create function public.request_support(p_owner_id uuid,p_request_id uuid,p_subject text,p_message text,p_reply_to text,p_reference_kind text default null,p_reference_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare delivery public.notification_deliveries; requested jsonb; message bigint;
begin
  if p_request_id is null or p_subject is null or p_message is null or char_length(btrim(p_subject)) not between 1 and 120 or char_length(btrim(p_message)) not between 20 and 4000 or
    p_subject~'[\r\n]' or p_reply_to is null or p_reply_to~'[\r\n]' or
    ((p_reference_kind is null)<>(p_reference_id is null)) or (p_reference_kind is not null and p_reference_kind not in('job','order')) then raise exception 'invalid_support_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found or exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='deletion') then raise exception 'account_unavailable'; end if;
  requested:=jsonb_build_object('subject',btrim(p_subject),'message',btrim(p_message),'replyTo',p_reply_to,'referenceKind',p_reference_kind,'referenceId',p_reference_id);
  select * into delivery from public.notification_deliveries where id=p_request_id for update;
  if found then
    if delivery.owner_id<>p_owner_id or delivery.payload<>requested then raise exception 'request_conflict'; end if;
    return to_jsonb(delivery);
  end if;
  if (select count(*) from public.notification_deliveries where owner_id=p_owner_id and created_at>=now()-interval '24 hours')>=5 then raise exception 'support_rate_limit'; end if;
  if p_reference_kind='job' and not exists(select 1 from public.processing_jobs where id=p_reference_id and owner_id=p_owner_id) then raise exception 'reference_unavailable'; end if;
  if p_reference_kind='order' and not exists(select 1 from public.payment_orders where id=p_reference_id and owner_id=p_owner_id) then raise exception 'reference_unavailable'; end if;
  insert into public.notification_deliveries(id,owner_id,dedupe_key,payload) values(p_request_id,p_owner_id,'support/'||p_request_id::text,requested) returning * into delivery;
  select pgmq.send('notification_jobs',jsonb_build_object('delivery_id',delivery.id)) into message;
  update public.notification_deliveries set message_id=message where id=delivery.id returning * into delivery;
  return to_jsonb(delivery);
end $$;

create function public.claim_notification_job() returns jsonb language plpgsql security invoker set search_path='' as $$
declare message record; delivery public.notification_deliveries; owner uuid;
begin
  select * into message from pgmq.read('notification_jobs',90,1);
  if not found then return null; end if;
  select owner_id into owner from public.notification_deliveries where id=(message.message->>'delivery_id')::uuid;
  perform 1 from public.profiles where id=owner for update;
  select * into delivery from public.notification_deliveries where id=(message.message->>'delivery_id')::uuid for update;
  if not found or delivery.state in('sent','failed','uncertain') then perform pgmq.delete('notification_jobs',message.msg_id); return null; end if;
  if exists(select 1 from public.account_data_requests where owner_id=delivery.owner_id and kind='deletion') then
    delete from public.notification_deliveries where id=delivery.id; perform pgmq.delete('notification_jobs',message.msg_id); return null; end if;
  if delivery.provider_started_at<now()-interval '23 hours' then
    update public.notification_deliveries set state='uncertain',error_code='delivery_window_expired',lease_token=null,lease_until=null where id=delivery.id;
    perform pgmq.delete('notification_jobs',message.msg_id); return null;
  end if;
  update public.notification_deliveries set lease_token=gen_random_uuid(),lease_until=message.vt,attempt=attempt+1,message_id=message.msg_id
    where id=delivery.id returning * into delivery;
  return to_jsonb(delivery);
end $$;

create function public.begin_notification_delivery(p_id uuid,p_lease_token uuid,p_payload_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare delivery public.notification_deliveries;
begin
  select * into delivery from public.notification_deliveries where id=p_id for update;
  if not found or delivery.lease_token is distinct from p_lease_token or delivery.lease_until<now() or delivery.state not in('queued','sending') then return false; end if;
  if exists(select 1 from public.account_data_requests where owner_id=delivery.owner_id and kind='deletion') then return false; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_payload_hash'; end if;
  if delivery.payload_hash is not null and delivery.payload_hash<>p_payload_hash then raise exception 'delivery_payload_changed'; end if;
  update public.notification_deliveries set state='sending',payload_hash=p_payload_hash,provider_started_at=coalesce(provider_started_at,now()) where id=p_id;
  return true;
end $$;

create function public.finish_notification_delivery(p_id uuid,p_lease_token uuid,p_state text,p_provider_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare delivery public.notification_deliveries;
begin
  select * into delivery from public.notification_deliveries where id=p_id for update;
  if not found or delivery.lease_token is distinct from p_lease_token or delivery.lease_until<now() then return false; end if;
  if p_state='retry' and delivery.attempt<8 and (delivery.provider_started_at is null or delivery.provider_started_at>now()-interval '23 hours') then
    update public.notification_deliveries set state='queued',error_code=left(p_error,100),lease_token=null,lease_until=null where id=p_id;
    perform pgmq.set_vt('notification_jobs',delivery.message_id,least(300,15*power(2,least(delivery.attempt,5))::integer)); return true;
  end if;
  if p_state='retry' then p_state:='uncertain'; end if;
  if p_state not in('sent','failed','uncertain') then raise exception 'invalid_delivery_state'; end if;
  if p_state='sent' and p_provider_id is null then raise exception 'provider_receipt_required'; end if;
  update public.notification_deliveries set state=p_state,provider_id=p_provider_id,error_code=left(p_error,100),sent_at=case when p_state='sent' then now() else null end,
    lease_token=null,lease_until=null where id=p_id;
  perform pgmq.delete('notification_jobs',delivery.message_id); return true;
end $$;

revoke all on function public.operations_retry_safety(uuid),public.operations_begin_action(uuid,uuid,text,uuid),public.operations_finish_action(uuid,text,jsonb,text),
  public.operations_retry_job(uuid,uuid,uuid),public.operations_snapshot(),public.request_support(uuid,uuid,text,text,text,text,uuid),
  public.claim_notification_job(),public.begin_notification_delivery(uuid,uuid,text),public.finish_notification_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.operations_retry_safety(uuid),public.operations_begin_action(uuid,uuid,text,uuid),public.operations_finish_action(uuid,text,jsonb,text),
  public.operations_retry_job(uuid,uuid,uuid),public.operations_snapshot(),public.request_support(uuid,uuid,text,text,text,text,uuid),
  public.claim_notification_job(),public.begin_notification_delivery(uuid,uuid,text),public.finish_notification_delivery(uuid,uuid,text,text,text) to service_role;

-- Validate the bounded projection before committing the new API contract.
do $$ begin perform public.operations_snapshot(); end $$;
