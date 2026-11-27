-- Polar owns catalog prices and renewal dates. Version 1 rows still explain historical usage.
alter table public.plans
  drop constraint plans_code_key,
  drop constraint plans_version_check,
  add unique (code, version),
  add check (version > 0),
  alter column price_centavos drop not null,
  alter column currency drop not null,
  alter column duration_days drop not null;

insert into public.plans (code, version, price_centavos, currency, duration_days, limits)
select 'paid', 2, null, null, null,
  limits || '{"documentPages":500,"transcriptionSeconds":36000,"chatMessages":300}'::jsonb
from public.plans where code = 'paid' and version = 1;

create table public.polar_runtime (
  singleton boolean primary key default true check (singleton),
  environment text not null check (environment in ('production', 'sandbox'))
);
insert into public.polar_runtime (environment) values ('production');

create table public.polar_checkouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  currency text not null check (currency in ('USD','PHP')),
  state text not null default 'creating'
    check (state in ('creating','open','confirmed','completed','expired','failed')),
  checkout_id uuid,
  url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours 5 minutes'),
  unique (environment, checkout_id),
  check (state <> 'open' or (checkout_id is not null and url is not null))
);
create unique index polar_one_open_checkout on public.polar_checkouts (owner_id, environment)
  where state in ('creating','open','confirmed');
create index polar_checkouts_owner on public.polar_checkouts (owner_id,created_at desc);

create table public.polar_customers (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  environment text not null check (environment in ('production','sandbox')),
  customer_id uuid not null,
  subscription_id uuid,
  status text check (status in ('active','trialing','past_due','paused','incomplete','unpaid','canceled')),
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  observed_at timestamptz not null,
  primary key (owner_id, environment),
  unique (environment, customer_id),
  unique (environment, subscription_id),
  check ((subscription_id is null) = (status is null)),
  check (period_end is null or period_start is null or period_end > period_start),
  check (status not in ('active','trialing') or (period_start is not null and period_end is not null))
);
create table public.polar_sync_events (
  environment text not null check (environment in ('production','sandbox')),
  event_id text not null check (length(event_id) between 1 and 255),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  primary key (environment, event_id)
);
create index polar_sync_events_owner on public.polar_sync_events(owner_id);

alter table public.polar_runtime enable row level security;
alter table public.polar_customers enable row level security;
alter table public.polar_checkouts enable row level security;
alter table public.polar_sync_events enable row level security;
revoke all on public.polar_runtime, public.polar_customers, public.polar_checkouts,
  public.polar_sync_events from public, anon, authenticated, service_role;
grant select on public.polar_runtime to service_role;
grant select, insert, update on public.polar_customers, public.polar_checkouts to service_role;
grant select, insert on public.polar_sync_events to service_role;

create function public.polar_reserve_checkout(p_owner_id uuid, p_environment text, p_currency text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.polar_checkouts;
  next_action text;
begin
  if not exists (select 1 from public.polar_runtime where environment = p_environment) then
    raise exception 'polar_environment_mismatch';
  end if;
  if p_currency is null or upper(p_currency) not in ('USD','PHP') then raise exception 'invalid_currency'; end if;
  perform 1 from public.profiles where id = p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if exists (select 1 from public.account_data_requests where owner_id = p_owner_id and kind = 'deletion') then
    raise exception 'account_deleting';
  end if;
  if exists (select 1 from public.polar_customers where owner_id = p_owner_id
    and environment = p_environment and subscription_id is not null) then
    return jsonb_build_object('action','portal');
  end if;
  -- Only a reservation whose link was never made available can expire without a Polar read.
  update public.polar_checkouts set state = 'expired'
    where owner_id = p_owner_id and environment = p_environment and state = 'creating' and expires_at <= now();
  select * into attempt from public.polar_checkouts where owner_id = p_owner_id
    and environment = p_environment and state in ('creating','open','confirmed');
  if found then
    next_action := case when attempt.state = 'open' then 'reuse' else 'busy' end;
  else
    insert into public.polar_checkouts (owner_id, environment, currency)
      values (p_owner_id, p_environment, upper(p_currency)) returning * into attempt;
    next_action := 'create';
  end if;
  return jsonb_build_object('action',next_action, 'id',attempt.id, 'checkoutId',attempt.checkout_id,
    'url',attempt.url, 'currency',attempt.currency, 'expiresAt',attempt.expires_at);
end $$;

create function public.polar_finish_checkout(p_owner_id uuid, p_environment text, p_id uuid, p_state text,
  p_checkout_id uuid default null, p_url text default null, p_expires_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.polar_checkouts;
begin
  if not exists (select 1 from public.polar_runtime where environment = p_environment) then
    raise exception 'polar_environment_mismatch';
  end if;
  perform 1 from public.profiles where id = p_owner_id for update;
  select * into attempt from public.polar_checkouts
    where id = p_id and owner_id = p_owner_id and environment = p_environment for update;
  if not found or (attempt.checkout_id is not null and p_checkout_id is not null and attempt.checkout_id <> p_checkout_id) then
    return false;
  end if;
  if p_state is null or p_state not in ('open','failed','expired','confirmed','completed') then raise exception 'invalid_checkout_state'; end if;
  if p_state = 'open' and (p_checkout_id is null or p_url is null or p_url !~ '^https://[^[:space:]]+$' or p_expires_at is null) then
    raise exception 'invalid_checkout';
  end if;
  -- Webhooks and checkout responses can arrive in either order. Terminal states never reopen.
  if attempt.state in ('completed','expired','failed') then return attempt.state = p_state; end if;
  if attempt.state = 'confirmed' and p_state = 'open' then return false; end if;
  update public.polar_checkouts set state = p_state, checkout_id = coalesce(attempt.checkout_id, p_checkout_id),
    url = case when p_state = 'open' then p_url end, expires_at = coalesce(p_expires_at, attempt.expires_at)
    where id = attempt.id;
  return true;
end $$;

-- p_subscription is the server's current, product-filtered Polar snapshot. An empty object clears access.
create function public.polar_sync_subscription(p_owner_id uuid, p_environment text, p_customer_id uuid,
  p_event_id text, p_observed_at timestamptz, p_subscription jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  previous public.polar_customers;
  sub_id uuid := (p_subscription->>'id')::uuid;
  current_status text := p_subscription->>'status';
begin
  if not exists (select 1 from public.polar_runtime where environment = p_environment) then
    raise exception 'polar_environment_mismatch';
  end if;
  if p_customer_id is null or p_observed_at is null or p_event_id is null or
    jsonb_typeof(p_subscription) is distinct from 'object' then raise exception 'invalid_subscription'; end if;
  perform 1 from public.profiles where id = p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into previous from public.polar_customers where owner_id = p_owner_id and environment = p_environment;
  if previous.customer_id is not null and previous.customer_id <> p_customer_id then raise exception 'polar_customer_mismatch'; end if;
  insert into public.polar_sync_events (environment, event_id, owner_id) values (p_environment, p_event_id, p_owner_id)
    on conflict (environment,event_id) do nothing;
  if not found then
    if not exists (select 1 from public.polar_sync_events where environment = p_environment
      and event_id = p_event_id and owner_id = p_owner_id) then raise exception 'polar_event_mismatch'; end if;
    return false;
  end if;
  if previous.observed_at > p_observed_at then return false; end if;
  insert into public.polar_customers (owner_id, environment, customer_id, subscription_id, status,
    period_start, period_end, cancel_at_period_end, observed_at)
    values (p_owner_id, p_environment, p_customer_id, sub_id, current_status,
      (p_subscription->>'currentPeriodStart')::timestamptz, (p_subscription->>'currentPeriodEnd')::timestamptz,
      coalesce((p_subscription->>'cancelAtPeriodEnd')::boolean,false), p_observed_at)
    on conflict (owner_id, environment) do update set subscription_id = excluded.subscription_id,
      status = excluded.status, period_start = excluded.period_start, period_end = excluded.period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, observed_at = excluded.observed_at;
  if sub_id is not null then
    update public.polar_checkouts set state = 'completed', url = null
      where owner_id = p_owner_id and environment = p_environment and state in ('creating','open','confirmed');
  end if;
  return true;
end $$;

create or replace function public.billing_account_context(p_owner_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  profile_created timestamptz;
  customer public.polar_customers;
  plan public.plans;
  period_start timestamptz;
  period_end timestamptz;
  period_id uuid;
  period_limits jsonb;
begin
  select created_at into profile_created from public.profiles where id = p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select c.* into customer from public.polar_customers c join public.polar_runtime r using (environment)
    where c.owner_id = p_owner_id;
  if customer.status in ('active','trialing') and customer.period_start <= now() and customer.period_end > now() then
    select * into strict plan from public.plans where code = 'paid' and version = 2;
    period_start := customer.period_start;
    period_end := customer.period_end;
  else
    select * into strict plan from public.plans where code = 'free' and version = 1;
    period_start := profile_created + floor(extract(epoch from (now() - profile_created)) / 2592000)::int * interval '30 days';
    period_end := period_start + interval '30 days';
  end if;
  insert into public.usage_periods (owner_id, starts_at, ends_at, plan_id, grant_id, limits_snapshot)
    values (p_owner_id, period_start, period_end, plan.id, null, plan.limits)
    on conflict (owner_id,starts_at) do update set ends_at = excluded.ends_at, plan_id = excluded.plan_id,
      grant_id = null, limits_snapshot = case when usage_periods.plan_id = excluded.plan_id and
        usage_periods.limits_snapshot <> '{}'::jsonb then usage_periods.limits_snapshot else excluded.limits_snapshot end
    returning id,limits_snapshot into period_id,period_limits;
  return jsonb_build_object('ownerId',p_owner_id, 'planId',plan.id, 'plan',plan.code, 'planVersion',plan.version,
    'grantId',null, 'periodId',period_id, 'startsAt',period_start, 'endsAt',period_end, 'limits',period_limits,
    'hasBillingAccount',customer.customer_id is not null, 'subscription',case when customer.subscription_id is not null
      then jsonb_build_object('status',customer.status,'currentPeriodEnd',customer.period_end,
        'cancelAtPeriodEnd',customer.cancel_at_period_end) else null end);
end $$;

create function public.polar_fence_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.profiles where id = new.owner_id for update;
  if exists (select 1 from public.polar_customers c join public.polar_runtime r using (environment)
    where owner_id = new.owner_id and subscription_id is not null)
    or exists (select 1 from public.polar_checkouts c join public.polar_runtime r using (environment)
      where owner_id = new.owner_id and (state in ('open','confirmed') or (state = 'creating' and expires_at > now()))) then
    raise exception 'billing_must_close';
  end if;
  return new;
end $$;
create trigger polar_fence_deletion before insert on public.account_data_requests
  for each row when (new.kind = 'deletion') execute function public.polar_fence_deletion();

-- Old rows are retained for audit. The predecessor only supported test-mode orders.
create or replace function public.notification_paid_expiry(p_owner_id uuid)
returns timestamptz language sql stable security invoker set search_path = '' as $$ select null::timestamptz $$;
drop function public.create_billing_checkout_order(uuid,uuid,text,text),
  public.claim_billing_order_operation(uuid,uuid,text,text), public.finish_billing_order_operation(uuid,uuid,uuid,text,text),
  public.create_billing_order(uuid,uuid), public.attach_billing_checkout(uuid,uuid,text,text),
  public.process_billing_event(jsonb,text);

revoke all on function public.polar_fence_deletion(), public.polar_reserve_checkout(uuid,text,text),
  public.polar_finish_checkout(uuid,text,uuid,text,uuid,text,timestamptz),
  public.polar_sync_subscription(uuid,text,uuid,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.polar_reserve_checkout(uuid,text,text),
  public.polar_finish_checkout(uuid,text,uuid,text,uuid,text,timestamptz),
  public.polar_sync_subscription(uuid,text,uuid,text,timestamptz,jsonb) to service_role;
