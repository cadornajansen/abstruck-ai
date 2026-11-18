alter table public.payment_orders
  add column checkout_request jsonb,
  add column operation_token uuid,
  add column operation_until timestamptz,
  add column checked_at timestamptz;

-- An owner can have only one unresolved payment attempt, including across tabs.
create or replace function public.create_billing_order(p_owner_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.payment_orders; plan_id uuid; order_id uuid:=gen_random_uuid();
begin
  if p_request_id is null then raise exception 'invalid_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into result from public.payment_orders where owner_id=p_owner_id and request_id=p_request_id;
  if found then return jsonb_build_object('order',to_jsonb(result),'createCheckout',false); end if;
  select * into result from public.payment_orders where owner_id=p_owner_id
    and state in('creating','pending','review') order by created_at limit 1;
  if found then return jsonb_build_object('order',to_jsonb(result),'createCheckout',false); end if;
  select id into plan_id from public.plans where code='paid';
  insert into public.payment_orders(id,owner_id,plan_id,request_id,reference_number,provider_attempted_at)
    values(order_id,p_owner_id,plan_id,p_request_id,'ABSTRUCK-'||order_id::text,now()) returning * into result;
  return jsonb_build_object('order',to_jsonb(result),'createCheckout',true);
end $$;

-- Freeze the exact provider request in the same transaction as order admission.
create function public.create_billing_checkout_order(p_owner_id uuid,p_request_id uuid,p_app_origin text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; target public.payment_orders;
begin
  if p_app_origin is null or p_app_origin !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
    then raise exception 'invalid_app_origin'; end if;
  result:=public.create_billing_order(p_owner_id,p_request_id);
  if (result->>'createCheckout')::boolean then
    select * into target from public.payment_orders where id=(result->'order'->>'id')::uuid;
    update public.payment_orders set checkout_request=jsonb_build_object('data',jsonb_build_object('attributes',jsonb_build_object(
      'line_items',jsonb_build_array(jsonb_build_object('name','Abstruck · 30 days (test)','amount',19900,'currency','PHP','quantity',1)),
      'payment_method_types',jsonb_build_array('qrph'),'reference_number',target.reference_number,
      'success_url',p_app_origin||'/billing?order='||target.id::text||'&return=success',
      'cancel_url',p_app_origin||'/billing?order='||target.id::text||'&return=cancel',
      'send_email_receipt',false,'pass_on_fees',false,
      'metadata',jsonb_build_object('order_id',target.id,'purpose','abstruck_test_billing'))))
      where id=target.id returning * into target;
    result:=jsonb_set(result,'{order}',to_jsonb(target));
  end if;
  return result;
end $$;

create function public.claim_billing_order_operation(p_owner_id uuid,p_order_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.payment_orders; token uuid:=gen_random_uuid();
begin
  if p_action not in('check','expire','create') then raise exception 'invalid_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into target from public.payment_orders where id=p_order_id and owner_id=p_owner_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if target.state not in('creating','pending','review') then return jsonb_build_object('order',to_jsonb(target)); end if;
  if target.operation_until>now() then raise exception 'checkout_operation_busy'; end if;
  if target.checkout_id is null and (target.checkout_request is null or target.provider_attempted_at<now()-interval '23 hours')
    then raise exception 'checkout_recovery_window_closed'; end if;
  update public.payment_orders set operation_token=token,operation_until=now()+interval '60 seconds'
    where id=target.id returning * into target;
  return jsonb_build_object('order',to_jsonb(target),'token',token);
end $$;

create function public.finish_billing_order_operation(p_owner_id uuid,p_order_id uuid,p_token uuid,p_outcome text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_outcome is not null and p_outcome not in('expired','rejected') then raise exception 'invalid_outcome'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  update public.payment_orders set
    state=case when state in('creating','pending','review') and payment_id is null then
      case when p_outcome='expired' and checkout_id is not null then 'expired'
        when p_outcome='rejected' and checkout_id is null then 'failed'
        when p_error is not null then 'review' else state end else state end,
    error_code=case when state in('paid','refunded','partially_refunded') then error_code else left(p_error,100) end,
    operation_token=null,operation_until=null,checked_at=now(),updated_at=now()
    where id=p_order_id and owner_id=p_owner_id and operation_token=p_token and operation_until>now();
  return found;
end $$;

-- A verified read can repair a lost attachment without overwriting a paid/refunded order.
create or replace function public.attach_billing_checkout(p_owner_id uuid,p_order_id uuid,p_checkout_id text,p_checkout_url text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_checkout_id !~ '^cs_[A-Za-z0-9]{3,100}$' or p_checkout_url !~ '^https://checkout\.paymongo\.com/[^[:space:]]+$'
    then raise exception 'invalid_checkout'; end if;
  update public.payment_orders set checkout_id=p_checkout_id,checkout_url=p_checkout_url,
    state=case when state in('creating','pending','review') and payment_id is null then 'pending' else state end,
    error_code=null,updated_at=now()
    where id=p_order_id and owner_id=p_owner_id and (checkout_id is null or checkout_id=p_checkout_id);
  return found;
end $$;

revoke select on public.payment_orders from authenticated;
grant select(id,owner_id,plan_id,request_id,reference_number,amount,currency,livemode,state,checkout_id,checkout_url,
  payment_id,payment_intent_id,refunded_amount,provider_attempted_at,paid_at,refunded_at,error_code,created_at,updated_at)
  on public.payment_orders to authenticated;
revoke all on function public.create_billing_checkout_order(uuid,uuid,text),public.claim_billing_order_operation(uuid,uuid,text),
  public.finish_billing_order_operation(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_billing_checkout_order(uuid,uuid,text),public.claim_billing_order_operation(uuid,uuid,text),
  public.finish_billing_order_operation(uuid,uuid,uuid,text,text) to service_role;
