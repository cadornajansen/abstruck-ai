-- The own-account predicate needs only two non-sensitive columns, not manifest access.
create policy account_request_fence_own on public.account_data_requests for select to authenticated using(owner_id=(select auth.uid()));
grant select(owner_id,kind) on public.account_data_requests to authenticated;
alter function public.account_is_active() security invoker;

alter function public.request_account_data(uuid,uuid,text,uuid) rename to request_account_data_before_retention;
create function public.request_account_data(p_owner_id uuid,p_request_id uuid,p_kind text,p_target_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; export_lease timestamptz; drain timestamptz;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  select max(lease_until) into export_lease from public.account_data_requests where owner_id=p_owner_id and status='running';
  result:=public.request_account_data_before_retention(p_owner_id,p_request_id,p_kind,p_target_id);
  if p_kind='deletion' then
    drain:=greatest((result->'payload'->>'drainUntil')::timestamptz,coalesce(export_lease+interval '1 minute',now()));
    update public.account_data_requests set payload=jsonb_set(payload,'{drainUntil}',to_jsonb(drain))
      where id=(result->>'id')::uuid returning to_jsonb(account_data_requests) into result;
    -- Do not leave a cancelled export's complete account snapshot behind after Auth cascades.
    update public.account_data_requests set payload='{}',status='failed',error_code='account_deleting',lease_token=null,lease_until=null
      where owner_id=p_owner_id and id<>(result->>'id')::uuid;
  end if;
  return result;
end $$;
revoke all on function public.request_account_data(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.request_account_data(uuid,uuid,text,uuid) to service_role;

create or replace function public.claim_account_data_job() returns jsonb language plpgsql security invoker set search_path='' as $$
declare message record; request public.account_data_requests; purge boolean:=false;
begin
  select * into message from pgmq.read('account_jobs',900,1);
  if not found then return null; end if;
  select * into request from public.account_data_requests where id=(message.message->>'request_id')::uuid for update;
  if not found then perform pgmq.delete('account_jobs',message.msg_id); return null; end if;
  if request.status='failed' then
    if request.kind='export' and request.object_key is not null and request.expires_at is not null then purge:=true;
    else perform pgmq.delete('account_jobs',message.msg_id); return null; end if;
  end if;
  if request.status='ready' then
    if request.kind='export' and request.object_key is not null then purge:=true;
    else perform pgmq.delete('account_jobs',message.msg_id); return null; end if;
  end if;
  if request.not_before>now() then perform pgmq.set_vt('account_jobs',message.msg_id,greatest(1,ceil(extract(epoch from request.not_before-now()))::integer)); return null; end if;
  if purge and request.expires_at>now() then perform pgmq.set_vt('account_jobs',message.msg_id,greatest(1,ceil(extract(epoch from request.expires_at-now()))::integer)); return null; end if;
  update public.account_data_requests set status=case when purge then status else 'running' end,
    lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',attempt=attempt+1,message_id=message.msg_id
    where id=request.id returning * into request;
  return to_jsonb(request)||jsonb_build_object('purge',purge);
end $$;

create or replace function public.checkpoint_account_data_job(p_id uuid,p_lease_token uuid,p_stage text,p_bytes bigint default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare request public.account_data_requests; message bigint; delay_seconds integer;
begin
  select * into request from public.account_data_requests where id=p_id for update;
  if not found or request.lease_token is distinct from p_lease_token or request.lease_until<now() or
    (request.status='failed' and p_stage not in('expired','retry')) then return false; end if;
  if p_stage='renew' then
    update public.account_data_requests set lease_until=now()+interval '15 minutes' where id=p_id;
    perform pgmq.set_vt('account_jobs',request.message_id,900); return true;
  elsif p_stage='wait' then
    update public.account_data_requests set lease_token=null,lease_until=null,not_before=(payload->>'drainUntil')::timestamptz where id=p_id;
    perform pgmq.set_vt('account_jobs',request.message_id,greatest(1,ceil(extract(epoch from (request.payload->>'drainUntil')::timestamptz-now()))::integer)); return true;
  elsif p_stage='retry' then
    if request.kind='export' and request.attempt>=6 then
      update public.account_data_requests set status='failed',payload='{}',error_code=left(p_error,100),lease_token=null,lease_until=null,
        expires_at=coalesce(expires_at,now()+interval '24 hours') where id=p_id;
      perform pgmq.set_vt('account_jobs',request.message_id,86400);
    else
      delay_seconds:=least(3600,30*power(2,least(request.attempt-1,7))::integer);
      update public.account_data_requests set status='queued',error_code=left(p_error,100),lease_token=null,lease_until=null where id=p_id;
      perform pgmq.set_vt('account_jobs',request.message_id,delay_seconds);
    end if;
    return true;
  elsif p_stage='expired' then
    update public.account_data_requests set object_key=null,payload='{}',lease_token=null,lease_until=null where id=p_id;
  elsif p_stage='ready' then
    if request.kind='material_deletion' then delete from public.materials where id=request.target_id and owner_id=request.owner_id; end if;
    if request.kind='deletion' then
      update public.account_data_requests set payload='{}',object_key=null where owner_id=request.owner_id and id<>request.id;
    end if;
    update public.account_data_requests set status='ready',completed_at=now(),error_code=null,bytes=p_bytes,payload='{}',lease_token=null,lease_until=null,
      expires_at=case when kind='export' then now()+interval '24 hours' else null end where id=p_id;
    if request.kind='export' then select pgmq.send('account_jobs',jsonb_build_object('request_id',p_id),86400) into message; end if;
  else raise exception 'invalid_checkpoint'; end if;
  perform pgmq.delete('account_jobs',request.message_id);
  return true;
end $$;
