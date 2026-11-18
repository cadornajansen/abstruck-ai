create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code in ('free','paid')),
  version integer not null default 1 check(version=1),
  price_centavos integer not null,
  currency text not null default 'PHP' check(currency='PHP'),
  duration_days integer not null default 30 check(duration_days=30),
  limits jsonb not null,
  check((code='free' and price_centavos=0) or (code='paid' and price_centavos=19900))
);
insert into public.plans(code,price_centavos,limits) values
  ('free',0,'{"storageBytes":100000000,"documentPages":50,"transcriptionSeconds":600,"ocrPages":5,"chatMessages":20,"studySets":3,"concurrentJobs":1}'),
  ('paid',19900,'{"storageBytes":2000000000,"documentPages":1000,"transcriptionSeconds":18000,"ocrPages":100,"chatMessages":500,"studySets":100,"concurrentJobs":2}');

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  request_id uuid not null,
  reference_number text not null unique,
  amount integer not null default 19900 check(amount=19900),
  currency text not null default 'PHP' check(currency='PHP'),
  livemode boolean not null default false check(not livemode),
  state text not null default 'creating' check(state in ('creating','pending','paid','refunded','partially_refunded','failed','expired','review')),
  checkout_id text unique,
  checkout_url text,
  payment_id text unique,
  payment_intent_id text unique,
  provider_attempted_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  refunded_amount integer not null default 0 check(refunded_amount>=0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,request_id), unique(id,owner_id,plan_id)
);
create index payment_orders_owner_created_idx on public.payment_orders(owner_id,created_at desc);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  order_id uuid references public.payment_orders(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  payment_id text,
  event_type text not null,
  body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
  livemode boolean not null default false check(not livemode),
  details jsonb not null,
  state text not null default 'received' check(state in ('received','processed','needs_reconciliation','ignored')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_events_order_idx on public.payment_events(order_id);
create index payment_events_owner_idx on public.payment_events(owner_id);
create index payment_events_payment_idx on public.payment_events(payment_id);

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  plan_id uuid not null,
  order_id uuid not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state text not null default 'active' check(state in ('active','revoked')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id,owner_id),
  foreign key(order_id,owner_id,plan_id) references public.payment_orders(id,owner_id,plan_id) on delete cascade,
  check(ends_at=starts_at+interval '30 days'),
  check((state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null))
);
create index access_grants_owner_period_idx on public.access_grants(owner_id,starts_at,ends_at) where state='active';
create index access_grants_plan_idx on public.access_grants(plan_id);
alter table public.usage_periods add column plan_id uuid references public.plans(id);
alter table public.usage_periods add column grant_id uuid unique;
alter table public.usage_periods add column limits_snapshot jsonb not null default '{}';
alter table public.usage_periods add constraint usage_periods_grant_owner_fkey foreign key(grant_id,owner_id)
  references public.access_grants(id,owner_id);
create index usage_periods_plan_idx on public.usage_periods(plan_id);

alter table public.plans enable row level security;
alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.access_grants enable row level security;
create policy plans_read on public.plans for select to anon,authenticated using(true);
create policy payment_orders_read_own on public.payment_orders for select to authenticated using((select auth.uid())=owner_id);
create policy payment_events_read_own on public.payment_events for select to authenticated using((select auth.uid())=owner_id);
create policy access_grants_read_own on public.access_grants for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.plans,public.payment_orders,public.payment_events,public.access_grants from anon,authenticated,service_role;
grant select on public.plans to anon,authenticated;
grant select on public.payment_orders,public.payment_events,public.access_grants to authenticated;
grant select on public.plans to service_role;
grant select,insert,update,delete on public.payment_orders,public.payment_events,public.access_grants to service_role;

create function public.billing_account_context(p_owner_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile_created timestamptz; active_grant public.access_grants; plan public.plans; period_start timestamptz;
  period_end timestamptz; period_id uuid;
begin
  select created_at into profile_created from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into active_grant from public.access_grants where owner_id=p_owner_id and state='active'
    and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if found then
    select * into plan from public.plans where id=active_grant.plan_id;
    period_start:=active_grant.starts_at; period_end:=active_grant.ends_at;
  else
    select * into plan from public.plans where code='free';
    period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
    period_end:=period_start+interval '30 days';
  end if;
  insert into public.usage_periods(owner_id,starts_at,ends_at,plan_id,grant_id,limits_snapshot)
    values(p_owner_id,period_start,period_end,plan.id,active_grant.id,plan.limits)
    on conflict(owner_id,starts_at) do update set plan_id=coalesce(usage_periods.plan_id,excluded.plan_id),
      grant_id=coalesce(usage_periods.grant_id,excluded.grant_id),
      limits_snapshot=case when usage_periods.limits_snapshot='{}'::jsonb then excluded.limits_snapshot else usage_periods.limits_snapshot end
    returning id into period_id;
  return jsonb_build_object('ownerId',p_owner_id,'planId',plan.id,'plan',plan.code,'planVersion',plan.version,'grantId',active_grant.id,
    'periodId',period_id,'startsAt',period_start,'endsAt',period_end,'limits',plan.limits);
end $$;

create function public.create_billing_order(p_owner_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.payment_orders; plan_id uuid; order_id uuid:=gen_random_uuid();
begin
  if p_request_id is null then raise exception 'invalid_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into result from public.payment_orders where owner_id=p_owner_id and request_id=p_request_id;
  if found then return jsonb_build_object('order',to_jsonb(result),'createCheckout',false); end if;
  select id into plan_id from public.plans where code='paid';
  insert into public.payment_orders(id,owner_id,plan_id,request_id,reference_number,provider_attempted_at)
    values(order_id,p_owner_id,plan_id,p_request_id,'ABSTRUCK-'||order_id::text,now()) returning * into result;
  return jsonb_build_object('order',to_jsonb(result),'createCheckout',true);
end $$;

create function public.attach_billing_checkout(p_owner_id uuid,p_order_id uuid,p_checkout_id text,p_checkout_url text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_checkout_id !~ '^cs_[A-Za-z0-9]{3,100}$' or p_checkout_url !~ '^https://checkout\.paymongo\.com/[^[:space:]]+$'
    then raise exception 'invalid_checkout'; end if;
  update public.payment_orders set checkout_id=p_checkout_id,checkout_url=p_checkout_url,
    state=case when state='creating' then 'pending' else state end,error_code=null,updated_at=now()
    where id=p_order_id and owner_id=p_owner_id and (checkout_id is null or checkout_id=p_checkout_id);
  return found;
end $$;

create function public.process_billing_event(p_event jsonb,p_body_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.payment_events; target public.payment_orders; grant_start timestamptz; refunded integer; existing_hash text;
begin
  if p_event->>'eventId' !~ '^evt_[A-Za-z0-9]{3,100}$' or p_body_sha256 !~ '^[a-f0-9]{64}$' or p_event->>'livemode'<>'false'
    then raise exception 'invalid_event'; end if;
  insert into public.payment_events(provider_event_id,payment_id,event_type,body_sha256,details)
    values(p_event->>'eventId',p_event->>'paymentId',p_event->>'type',p_body_sha256,p_event)
    on conflict(provider_event_id) do nothing returning * into saved;
  if not found then
    select body_sha256 into existing_hash from public.payment_events where provider_event_id=p_event->>'eventId';
    if existing_hash<>p_body_sha256 then return jsonb_build_object('error','event_conflict'); end if;
    return jsonb_build_object('received',true,'duplicate',true);
  end if;
  if p_event->>'type'='checkout_session.payment.paid' then
    select * into target from public.payment_orders where reference_number=p_event->>'referenceNumber';
  else
    select * into target from public.payment_orders where payment_id=p_event->>'paymentId';
  end if;
  if target.id is null then
    update public.payment_events set state='needs_reconciliation',error_code='order_unmatched' where id=saved.id;
    return jsonb_build_object('received',true,'reconciliationRequired',true);
  end if;
  perform 1 from public.profiles where id=target.owner_id for update;
  select * into target from public.payment_orders where id=target.id for update;
  update public.payment_events set order_id=target.id,owner_id=target.owner_id where id=saved.id;
  if p_event->>'type'='checkout_session.payment.paid' then
    if not coalesce(p_event->>'paymentId' ~ '^pay_[A-Za-z0-9]{3,100}$' and p_event->>'paymentIntentId' ~ '^pi_[A-Za-z0-9]{3,100}$'
      and p_event->>'checkoutId' ~ '^cs_[A-Za-z0-9]{3,100}$' and (p_event->>'amount')::integer=target.amount
      and p_event->>'currency'=target.currency and p_event->>'paymentMethod'='qrph',false)
      or (target.checkout_id is not null and target.checkout_id<>p_event->>'checkoutId')
      or (target.payment_id is not null and target.payment_id<>p_event->>'paymentId')
      or exists(select 1 from public.payment_orders where id<>target.id and (payment_id=p_event->>'paymentId' or payment_intent_id=p_event->>'paymentIntentId'))
      then
      update public.payment_events set state='needs_reconciliation',error_code='payment_contract_mismatch' where id=saved.id;
      update public.payment_orders set error_code='payment_needs_review',state=case when payment_id is null then 'review' else state end where id=target.id;
      return jsonb_build_object('received',true,'reconciliationRequired',true);
    end if;
    update public.payment_orders set state=case when state in ('refunded','partially_refunded') then state else 'paid' end,
      checkout_id=p_event->>'checkoutId',payment_id=p_event->>'paymentId',payment_intent_id=p_event->>'paymentIntentId',
      paid_at=coalesce(paid_at,now()),error_code=null,updated_at=now() where id=target.id;
    if not exists(select 1 from public.access_grants where order_id=target.id) then
      select greatest(now(),coalesce(max(ends_at),now())) into grant_start from public.access_grants where owner_id=target.owner_id and state='active';
      insert into public.access_grants(owner_id,plan_id,order_id,starts_at,ends_at)
        values(target.owner_id,target.plan_id,target.id,grant_start,grant_start+interval '30 days');
    end if;
    update public.payment_events set order_id=target.id,owner_id=target.owner_id
      where payment_id=p_event->>'paymentId' and order_id is null;
  elsif p_event->>'type' not in ('payment.refunded','payment.refund.updated') then
    update public.payment_events set state='ignored',processed_at=now() where id=saved.id;
    return jsonb_build_object('received',true,'ignored',true);
  end if;
  select coalesce(sum(amount),0)::integer into refunded from (
    select r->>'id',max((r->>'amount')::integer) amount from public.payment_events e
      cross join lateral jsonb_array_elements(coalesce(e.details->'refunds','[]')) r
      where e.payment_id=p_event->>'paymentId' and r->>'status'='succeeded' group by r->>'id'
  ) refunds;
  if refunded>0 then
    update public.access_grants set state='revoked',revoked_at=coalesce(revoked_at,now()) where order_id=target.id;
    update public.payment_orders set refunded_amount=refunded,refunded_at=coalesce(refunded_at,now()),updated_at=now(),
      state=case when refunded>=amount then 'refunded' else 'partially_refunded' end where id=target.id;
  end if;
  update public.payment_events set state='processed',processed_at=now(),error_code=null
    where payment_id=p_event->>'paymentId' and order_id=target.id and state in ('received','needs_reconciliation');
  return jsonb_build_object('received',true,'duplicate',false);
end $$;

revoke all on function public.billing_account_context(uuid),public.create_billing_order(uuid,uuid),
  public.attach_billing_checkout(uuid,uuid,text,text),public.process_billing_event(jsonb,text) from public,anon,authenticated;
grant execute on function public.billing_account_context(uuid),public.create_billing_order(uuid,uuid),
  public.attach_billing_checkout(uuid,uuid,text,text),public.process_billing_event(jsonb,text) to service_role;
