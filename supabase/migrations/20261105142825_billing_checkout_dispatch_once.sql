-- A real sandbox replay returned a different session despite Idempotency-Key.
-- Record dispatch under the owner/operation lock before calling the provider.
create or replace function public.create_billing_checkout_order(p_owner_id uuid,p_request_id uuid,p_app_origin text,p_key_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; target public.payment_orders;
begin
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_key_scope'; end if;
  if p_app_origin is null or p_app_origin !~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
    then raise exception 'invalid_app_origin'; end if;
  result:=public.create_billing_order(p_owner_id,p_request_id);
  if (result->>'createCheckout')::boolean then
    select * into target from public.payment_orders where id=(result->'order'->>'id')::uuid;
    update public.payment_orders set provider_key_hash=p_key_hash,provider_attempted_at=null,
      checkout_request=jsonb_build_object('data',jsonb_build_object('attributes',jsonb_build_object(
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

create or replace function public.claim_billing_order_operation(p_owner_id uuid,p_order_id uuid,p_action text,p_key_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.payment_orders; token uuid:=gen_random_uuid(); needs_create boolean;
begin
  if p_action not in('check','expire','create') then raise exception 'invalid_request'; end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into target from public.payment_orders where id=p_order_id and owner_id=p_owner_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if target.state not in('creating','pending','review') then return jsonb_build_object('order',to_jsonb(target)); end if;
  if target.operation_until>now() then raise exception 'checkout_operation_busy'; end if;
  needs_create:=target.checkout_id is null;
  if needs_create then
    if target.checkout_request is null or target.provider_key_hash is distinct from p_key_hash
      or p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$'
      then raise exception 'checkout_recovery_window_closed'; end if;
    if target.provider_attempted_at is not null then raise exception 'checkout_creation_uncertain'; end if;
  end if;
  update public.payment_orders set operation_token=token,operation_until=now()+interval '60 seconds',
    provider_attempted_at=case when needs_create then now() else provider_attempted_at end
    where id=target.id returning * into target;
  return jsonb_build_object('order',to_jsonb(target),'token',token,'createCheckout',needs_create);
end $$;

revoke all on function public.create_billing_checkout_order(uuid,uuid,text,text),public.claim_billing_order_operation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_billing_checkout_order(uuid,uuid,text,text),public.claim_billing_order_operation(uuid,uuid,text,text) to service_role;
