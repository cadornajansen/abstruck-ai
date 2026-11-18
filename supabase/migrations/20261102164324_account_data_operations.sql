create table public.account_data_requests (
  id uuid primary key,
  owner_id uuid not null,
  kind text not null check(kind in ('export','deletion','material_deletion')),
  target_id uuid,
  status text not null default 'queued' check(status in ('queued','running','ready','failed')),
  payload jsonb not null default '{}',
  object_key text,
  bytes bigint,
  expires_at timestamptz,
  error_code text,
  attempt integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  message_id bigint,
  not_before timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index account_data_requests_owner_kind_idx on public.account_data_requests(owner_id,kind,created_at desc);
create unique index account_one_deletion_idx on public.account_data_requests(owner_id) where kind='deletion';
create unique index account_material_deletion_idx on public.account_data_requests(owner_id,target_id) where kind='material_deletion';
alter table public.account_data_requests enable row level security;
revoke all on public.account_data_requests from public,anon,authenticated;
grant all on public.account_data_requests to service_role;
select pgmq.create('account_jobs');
grant all on pgmq.q_account_jobs,pgmq.a_account_jobs to service_role;
grant usage,select on sequence pgmq.q_account_jobs_msg_id_seq to service_role;

-- Only this own-account boolean is exposed; manifests remain server-only after Auth cascades.
create function public.account_is_active() returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and not exists(select 1 from public.account_data_requests
    where owner_id=(select auth.uid()) and kind='deletion');
$$;
revoke all on function public.account_is_active() from public,anon;
grant execute on function public.account_is_active() to authenticated,service_role;
do $$ declare owned record; begin
  for owned in select distinct table_name from information_schema.columns where table_schema='public'
    and (column_name='owner_id' or table_name='profiles') and table_name<>'account_data_requests' loop
    execute format('create policy account_active_access on public.%I as restrictive for all to authenticated using ((select public.account_is_active())) with check ((select public.account_is_active()))',owned.table_name);
  end loop;
end $$;

create function public.fence_deleting_account_work() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.account_data_requests where owner_id=new.owner_id and kind='deletion') then
    if tg_table_name='usage_ledger' then
      if new.status<>'reserved' then return new; end if;
    elsif tg_table_name='processing_jobs' then
      if new.state not in('queued','running','waiting_provider') then return new; end if;
    end if;
    raise exception 'account_deleting';
  end if;
  return new;
end $$;
create trigger account_fence_materials before insert on public.materials for each row execute function public.fence_deleting_account_work();
create trigger account_fence_jobs before insert or update on public.processing_jobs for each row execute function public.fence_deleting_account_work();
create trigger account_fence_usage before insert or update on public.usage_ledger for each row execute function public.fence_deleting_account_work();
revoke all on function public.fence_deleting_account_work() from public,anon,authenticated;
grant execute on function public.fence_deleting_account_work() to service_role;

alter table public.materials add column deleted_at timestamptz;
create policy material_not_deleted on public.materials as restrictive for select to authenticated using(deleted_at is null);
alter table public.study_sets alter column material_id drop not null;
alter table public.study_sets add column source_unavailable boolean not null default false;
alter table public.study_sets drop constraint study_sets_material_id_owner_id_fkey;
alter table public.study_sets add constraint study_sets_material_id_owner_id_fkey foreign key(material_id,owner_id)
  references public.materials(id,owner_id) on delete set null(material_id);

-- Narrow service-only Auth projection; passwords, tokens and identity secrets are never exported.
create function public.account_export_snapshot(p_owner_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; rows jsonb; owned record;
begin
  result:=jsonb_build_object('formatVersion',1,'exportedAt',now(),'account',
    (select jsonb_build_object('id',id,'email',email,'createdAt',created_at,'emailConfirmedAt',email_confirmed_at) from auth.users where id=p_owner_id),'tables','{}'::jsonb);
  for owned in select distinct table_name from information_schema.columns where table_schema='public'
    and column_name='owner_id' and table_name<>'account_data_requests' order by table_name loop
    execute format('select coalesce(jsonb_agg(to_jsonb(row)-''embedding''-''search_text''),''[]'') from public.%I row where owner_id=$1',owned.table_name)
      into rows using p_owner_id;
    result:=jsonb_set(result,array['tables',owned.table_name],rows);
  end loop;
  result:=jsonb_set(result,'{profile}',coalesce((select to_jsonb(p) from public.profiles p where id=p_owner_id),'null'));
  if octet_length(result::text)>100000000 then raise exception 'export_data_limit'; end if;
  return result;
end $$;

create function public.request_account_data(p_owner_id uuid,p_request_id uuid,p_kind text,p_target_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare request public.account_data_requests; manifest jsonb; latest_lease timestamptz; drain timestamptz; message bigint;
begin
  if p_request_id is null or p_kind is null or p_kind not in('export','deletion','material_deletion') or
    (p_kind='material_deletion' and p_target_id is null) or (p_kind<>'material_deletion' and p_target_id is not null) then raise exception 'invalid_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'account_unavailable'; end if;
  select * into request from public.account_data_requests where id=p_request_id for update;
  if found then
    if request.owner_id<>p_owner_id or request.kind<>p_kind or request.target_id is distinct from p_target_id then raise exception 'request_conflict'; end if;
    return to_jsonb(request);
  end if;
  if exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='deletion') then raise exception 'account_deleting'; end if;
  if p_kind='export' then
    if exists(select 1 from public.account_data_requests where owner_id=p_owner_id and kind='export' and status in('queued','running')) then raise exception 'export_in_progress'; end if;
    manifest:=jsonb_build_object('snapshot',public.account_export_snapshot(p_owner_id));
  else
    if p_kind='material_deletion' then
      select * into request from public.account_data_requests where owner_id=p_owner_id and kind=p_kind and target_id=p_target_id;
      if found then return to_jsonb(request); end if;
      perform 1 from public.materials where id=p_target_id and owner_id=p_owner_id for update;
      if not found then raise exception 'material_not_found'; end if;
    end if;
    select max(lease_until) into latest_lease from public.processing_jobs where owner_id=p_owner_id
      and (p_target_id is null or material_id=p_target_id) and state='running';
    select greatest(now(),coalesce(max(case when status='awaiting_upload' then now()+interval '16 minutes'
      when source_type in('pdf','docx','pptx','audio','video') then updated_at+interval '16 minutes' else now() end),now()),
      coalesce(latest_lease+interval '1 minute',now())) into drain from public.materials
      where owner_id=p_owner_id and (p_target_id is null or id=p_target_id);
    manifest:=jsonb_build_object('prefix',p_owner_id::text||'/'||case when p_target_id is null then '' else p_target_id::text||'/' end,
      'drainUntil',drain,'assets',(select coalesce(jsonb_agg(jsonb_build_object('key',object_key,'metadata',metadata)),'[]') from public.assets
        where owner_id=p_owner_id and (p_target_id is null or material_id=p_target_id)),
      'transcripts',(select coalesce(jsonb_agg(jsonb_build_object('id',provider_id,'audioUrl',provider_audio_url,'state',state)),'[]')
        from public.transcription_runs where owner_id=p_owner_id and (p_target_id is null or material_id=p_target_id)));
    update public.share_links set revoked_at=coalesce(revoked_at,now()) where owner_id=p_owner_id and
      (p_target_id is null or (include_sources and source_snapshot @> jsonb_build_array(jsonb_build_object('material_id',p_target_id))));
    update public.processing_jobs set state='failed',error_code='source_deleted',lease_token=null,lease_until=null,updated_at=now()
      where owner_id=p_owner_id and state in('queued','running','waiting_provider') and (p_target_id is null or material_id=p_target_id);
    update public.messages set state='interrupted' where owner_id=p_owner_id and state in('pending','queued')
      and (p_target_id is null or conversation_id in(select id from public.conversations where material_id=p_target_id));
    update public.usage_ledger set status='uncertain',updated_at=now() where owner_id=p_owner_id and status='reserved'
      and (p_target_id is null or processing_job_id in(select id from public.processing_jobs where material_id=p_target_id));
    if p_target_id is not null then
      update public.materials set deleted_at=now() where id=p_target_id;
      update public.study_sets set source_unavailable=true where owner_id=p_owner_id and (material_id=p_target_id or id in
        (select v.study_set_id from public.study_set_versions v join public.study_set_sources s on s.version_id=v.id where s.material_id=p_target_id));
      delete from public.source_segments where material_id=p_target_id and owner_id=p_owner_id;
    else
      update public.account_data_requests set status='failed',error_code='account_deleting',lease_token=null,lease_until=null
        where owner_id=p_owner_id and kind='export' and status in('queued','running');
      update public.payment_events set details='{}' where owner_id=p_owner_id;
    end if;
  end if;
  insert into public.account_data_requests(id,owner_id,kind,target_id,payload,object_key)
    values(p_request_id,p_owner_id,p_kind,p_target_id,manifest,case when p_kind='export' then p_owner_id::text||'/exports/'||p_request_id::text||'.tar.gz' else null end)
    returning * into request;
  select pgmq.send('account_jobs',jsonb_build_object('request_id',request.id)) into message;
  update public.account_data_requests set message_id=message where id=request.id returning * into request;
  return to_jsonb(request);
end $$;

create function public.claim_account_data_job() returns jsonb language plpgsql security invoker set search_path='' as $$
declare message record; request public.account_data_requests;
begin
  select * into message from pgmq.read('account_jobs',900,1);
  if not found then return null; end if;
  select * into request from public.account_data_requests where id=(message.message->>'request_id')::uuid for update;
  if not found or request.status='failed' or (request.status='ready' and (request.kind<>'export' or request.object_key is null)) then
    perform pgmq.delete('account_jobs',message.msg_id); return null; end if;
  if request.not_before>now() then perform pgmq.set_vt('account_jobs',message.msg_id,greatest(1,ceil(extract(epoch from request.not_before-now()))::integer)); return null; end if;
  if request.status='ready' and request.expires_at>now() then perform pgmq.set_vt('account_jobs',message.msg_id,greatest(1,ceil(extract(epoch from request.expires_at-now()))::integer)); return null; end if;
  update public.account_data_requests set status=case when status='ready' then status else 'running' end,
    lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',attempt=attempt+1,message_id=message.msg_id
    where id=request.id returning * into request;
  return to_jsonb(request);
end $$;

create function public.checkpoint_account_data_job(p_id uuid,p_lease_token uuid,p_stage text,p_bytes bigint default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare request public.account_data_requests; message bigint;
begin
  select * into request from public.account_data_requests where id=p_id for update;
  if not found or request.lease_token is distinct from p_lease_token or request.lease_until<now() or request.status='failed' then return false; end if;
  if p_stage='renew' then
    update public.account_data_requests set lease_until=now()+interval '15 minutes' where id=p_id;
    perform pgmq.set_vt('account_jobs',request.message_id,900); return true;
  elsif p_stage='wait' then
    update public.account_data_requests set lease_token=null,lease_until=null,not_before=(payload->>'drainUntil')::timestamptz where id=p_id;
    perform pgmq.set_vt('account_jobs',request.message_id,greatest(1,ceil(extract(epoch from (request.payload->>'drainUntil')::timestamptz-now()))::integer)); return true;
  elsif p_stage='retry' then
    update public.account_data_requests set status=case when attempt>=6 then 'failed' else 'queued' end,error_code=left(p_error,100),lease_token=null,lease_until=null where id=p_id;
    if request.attempt>=6 then perform pgmq.delete('account_jobs',request.message_id); else perform pgmq.set_vt('account_jobs',request.message_id,30); end if;
    return true;
  elsif p_stage='expired' then
    update public.account_data_requests set object_key=null,payload='{}',lease_token=null,lease_until=null where id=p_id;
  elsif p_stage='ready' then
    if request.kind='material_deletion' then delete from public.materials where id=request.target_id and owner_id=request.owner_id; end if;
    update public.account_data_requests set status='ready',completed_at=now(),error_code=null,bytes=p_bytes,payload='{}',lease_token=null,lease_until=null,
      expires_at=case when kind='export' then now()+interval '24 hours' else null end where id=p_id;
    if request.kind='export' then
      select pgmq.send('account_jobs',jsonb_build_object('request_id',p_id),86400) into message;
    end if;
  else raise exception 'invalid_checkpoint'; end if;
  perform pgmq.delete('account_jobs',request.message_id);
  return true;
end $$;

revoke all on function public.account_export_snapshot(uuid),public.request_account_data(uuid,uuid,text,uuid),public.claim_account_data_job(),
  public.checkpoint_account_data_job(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.account_export_snapshot(uuid),public.request_account_data(uuid,uuid,text,uuid),public.claim_account_data_job(),
  public.checkpoint_account_data_job(uuid,uuid,text,bigint,text) to service_role;
