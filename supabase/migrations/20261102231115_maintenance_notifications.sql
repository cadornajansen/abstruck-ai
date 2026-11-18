alter table public.notification_deliveries drop constraint notification_deliveries_template_check;
alter table public.notification_deliveries add constraint notification_deliveries_template_check
  check(template in('support_request','renewal_reminder','operations_digest'));
create index access_grants_notification_due_idx on public.access_grants(ends_at,owner_id) where state='active';

-- Extend the currently paid (or just expired) chain through contiguous early renewals.
create function public.notification_paid_expiry(p_owner_id uuid)
returns timestamptz language sql stable security invoker set search_path='' as $$
  with recursive coverage(ends_at) as (
    select ends_at from public.access_grants
      where owner_id=p_owner_id and state='active' and starts_at<=now() and ends_at>now()-interval '1 day'
    union
    select g.ends_at from public.access_grants g join coverage c on g.starts_at<=c.ends_at and g.ends_at>c.ends_at
      where g.owner_id=p_owner_id and g.state='active'
  ) select max(ends_at) from coverage;
$$;

create function public.notification_is_current(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare delivery public.notification_deliveries; expiry timestamptz; stage text;
begin
  select * into delivery from public.notification_deliveries where id=p_id;
  if not found or not exists(select 1 from public.profiles where id=delivery.owner_id) or
    exists(select 1 from public.account_data_requests where owner_id=delivery.owner_id and kind='deletion') then return false; end if;
  if delivery.template='renewal_reminder' then
    expiry:=public.notification_paid_expiry(delivery.owner_id);
    stage:=case when expiry<=now() then 'expired' when expiry<=now()+interval '1 day' then 'day1'
      when expiry<=now()+interval '3 days' then 'day3' end;
    return coalesce(expiry=(delivery.payload->>'expiresAt')::timestamptz and stage=delivery.payload->>'stage',false);
  elsif delivery.template='operations_digest' then
    return delivery.payload->>'day'=to_char(now() at time zone 'UTC','YYYY-MM-DD');
  end if;
  return delivery.template='support_request';
end $$;

create function public.schedule_maintenance_notifications(p_founder_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner record; expiry timestamptz; stage text; delivery_id uuid; queued_message_id bigint; body jsonb;
  reminder_count integer:=0; digest_count integer:=0; digest_day text:=to_char(now() at time zone 'UTC','YYYY-MM-DD');
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_notification_limit'; end if;
  for owner in select p.id from public.profiles p where p.id in
    (select g.owner_id from public.access_grants g where g.state='active' and g.ends_at>now()-interval '1 day' and g.ends_at<=now()+interval '3 days')
    and public.notification_paid_expiry(p.id)<=now()+interval '3 days'
    and not exists(select 1 from public.account_data_requests where owner_id=p.id and kind='deletion')
    and not exists(select 1 from public.notification_deliveries d where d.dedupe_key=
      'renewal/'||p.id::text||'/'||extract(epoch from public.notification_paid_expiry(p.id))::text||'/'||
      case when public.notification_paid_expiry(p.id)<=now() then 'expired'
        when public.notification_paid_expiry(p.id)<=now()+interval '1 day' then 'day1' else 'day3' end)
    order by p.id limit p_limit for update skip locked
  loop
    expiry:=public.notification_paid_expiry(owner.id);
    stage:=case when expiry<=now() then 'expired' when expiry<=now()+interval '1 day' then 'day1' else 'day3' end;
    insert into public.notification_deliveries(id,owner_id,dedupe_key,template,payload)
      values(gen_random_uuid(),owner.id,'renewal/'||owner.id::text||'/'||extract(epoch from expiry)::text||'/'||stage,
        'renewal_reminder',jsonb_build_object('expiresAt',expiry,'stage',stage))
      on conflict(dedupe_key) do nothing returning id into delivery_id;
    if found then
      select pgmq.send('notification_jobs',jsonb_build_object('delivery_id',delivery_id)) into queued_message_id;
      update public.notification_deliveries set message_id=queued_message_id where id=delivery_id;
      reminder_count:=reminder_count+1;
    end if;
  end loop;

  if p_founder_id is not null then
    perform 1 from public.profiles where id=p_founder_id for update;
    if found and not exists(select 1 from public.account_data_requests where owner_id=p_founder_id and kind='deletion')
      and not exists(select 1 from public.notification_deliveries where dedupe_key='operations/'||digest_day) then
      select jsonb_build_object('day',digest_day,'windowHours',24,
        'actualUsd',(select coalesce(sum(cost_usd),0) from public.usage_ledger where created_at>=now()-interval '24 hours'),
        'reservedUsd',(select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where status='reserved' and created_at>=now()-interval '24 hours'),
        'queued',count(*)filter(where state='queued'),
        'staleQueued',count(*)filter(where state='queued' and updated_at<now()-interval '15 minutes'),
        'staleRunning',count(*)filter(where state='running' and lease_until<now()),
        'staleWaiting',count(*)filter(where state='waiting_provider' and updated_at<now()-interval '30 minutes'),
        'failed',count(*)filter(where state='failed' and updated_at>=now()-interval '24 hours'),
        'reconciliationCount',(select count(*) from public.payment_orders where state='review'),
        'jobIds',(select coalesce(jsonb_agg(id),'[]') from(select id from public.processing_jobs where
          (state='queued' and updated_at<now()-interval '15 minutes') or (state='running' and lease_until<now()) or
          (state='waiting_provider' and updated_at<now()-interval '30 minutes') order by updated_at limit 5)j),
        'orderIds',(select coalesce(jsonb_agg(id),'[]') from(select id from public.payment_orders where state='review' order by updated_at limit 5)o))
        into body from public.processing_jobs;
      insert into public.notification_deliveries(id,owner_id,dedupe_key,template,payload)
        values(gen_random_uuid(),p_founder_id,'operations/'||digest_day,'operations_digest',body)
        on conflict(dedupe_key) do nothing returning id into delivery_id;
      if found then
        select pgmq.send('notification_jobs',jsonb_build_object('delivery_id',delivery_id)) into queued_message_id;
        update public.notification_deliveries set message_id=queued_message_id where id=delivery_id;
        digest_count:=1;
      end if;
    end if;
  end if;
  return jsonb_build_object('reminders',reminder_count,'digests',digest_count);
end $$;

create or replace function public.claim_notification_job() returns jsonb language plpgsql security invoker set search_path='' as $$
declare message record; delivery public.notification_deliveries; owner uuid;
begin
  select * into message from pgmq.read('notification_jobs',90,1);
  if not found then return null; end if;
  select owner_id into owner from public.notification_deliveries where id=(message.message->>'delivery_id')::uuid;
  perform 1 from public.profiles where id=owner for update;
  select * into delivery from public.notification_deliveries where id=(message.message->>'delivery_id')::uuid for update;
  if not found or delivery.state in('sent','failed','uncertain') then perform pgmq.delete('notification_jobs',message.msg_id); return null; end if;
  if not public.notification_is_current(delivery.id) then
    update public.notification_deliveries set state='failed',error_code='notification_no_longer_applicable',lease_token=null,lease_until=null where id=delivery.id;
    perform pgmq.delete('notification_jobs',message.msg_id); return null; end if;
  if delivery.provider_started_at<now()-interval '23 hours' then
    update public.notification_deliveries set state='uncertain',error_code='delivery_window_expired',lease_token=null,lease_until=null where id=delivery.id;
    perform pgmq.delete('notification_jobs',message.msg_id); return null;
  end if;
  update public.notification_deliveries set lease_token=gen_random_uuid(),lease_until=message.vt,attempt=attempt+1,message_id=message.msg_id
    where id=delivery.id returning * into delivery;
  return to_jsonb(delivery);
end $$;

create or replace function public.begin_notification_delivery(p_id uuid,p_lease_token uuid,p_payload_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare delivery public.notification_deliveries;
begin
  select owner_id into delivery.owner_id from public.notification_deliveries where id=p_id;
  perform 1 from public.profiles where id=delivery.owner_id for update;
  select * into delivery from public.notification_deliveries where id=p_id for update;
  if not found or delivery.lease_token is distinct from p_lease_token or delivery.lease_until<now() or delivery.state not in('queued','sending') then return false; end if;
  if not public.notification_is_current(delivery.id) then
    update public.notification_deliveries set state='failed',error_code='notification_no_longer_applicable',lease_token=null,lease_until=null where id=p_id;
    perform pgmq.delete('notification_jobs',delivery.message_id); return false; end if;
  if p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_payload_hash'; end if;
  if delivery.payload_hash is not null and delivery.payload_hash<>p_payload_hash then raise exception 'delivery_payload_changed'; end if;
  update public.notification_deliveries set state='sending',payload_hash=p_payload_hash,provider_started_at=coalesce(provider_started_at,now()) where id=p_id;
  return true;
end $$;

-- Automated notices do not consume the student's support-form allowance.
create or replace function public.request_support(p_owner_id uuid,p_request_id uuid,p_subject text,p_message text,p_reply_to text,p_reference_kind text default null,p_reference_id uuid default null)
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
    if delivery.owner_id<>p_owner_id or delivery.payload<>requested or delivery.template<>'support_request' then raise exception 'request_conflict'; end if;
    return to_jsonb(delivery);
  end if;
  if (select count(*) from public.notification_deliveries where owner_id=p_owner_id and template='support_request' and created_at>=now()-interval '24 hours')>=5 then raise exception 'support_rate_limit'; end if;
  if p_reference_kind='job' and not exists(select 1 from public.processing_jobs where id=p_reference_id and owner_id=p_owner_id) then raise exception 'reference_unavailable'; end if;
  if p_reference_kind='order' and not exists(select 1 from public.payment_orders where id=p_reference_id and owner_id=p_owner_id) then raise exception 'reference_unavailable'; end if;
  insert into public.notification_deliveries(id,owner_id,dedupe_key,payload) values(p_request_id,p_owner_id,'support/'||p_request_id::text,requested) returning * into delivery;
  select pgmq.send('notification_jobs',jsonb_build_object('delivery_id',delivery.id)) into message;
  update public.notification_deliveries set message_id=message where id=delivery.id returning * into delivery;
  return to_jsonb(delivery);
end $$;

revoke all on function public.notification_paid_expiry(uuid),public.notification_is_current(uuid),public.schedule_maintenance_notifications(uuid,integer) from public,anon,authenticated;
grant execute on function public.notification_paid_expiry(uuid),public.notification_is_current(uuid),public.schedule_maintenance_notifications(uuid,integer) to service_role;
