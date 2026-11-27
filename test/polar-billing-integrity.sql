-- Run against a migrated development database with psql -v ON_ERROR_STOP=1.
begin;
do $$
declare
  owner uuid := gen_random_uuid();
  other_owner uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  checkout uuid := gen_random_uuid();
  sub uuid := gen_random_uuid();
  started timestamptz := now() - interval '3 days';
  snapshot jsonb;
  attempt jsonb;
  retry jsonb;
  ctx jsonb;
  free_period text;
  pro_period text;
begin
  insert into auth.users(id) values(owner),(other_owner);
  insert into public.profiles(id) values(owner),(other_owner) on conflict(id) do nothing;
  if has_table_privilege('authenticated','public.polar_customers','update')
    or has_function_privilege('authenticated','public.polar_sync_subscription(uuid,text,uuid,text,timestamptz,jsonb)','execute')
    or to_regprocedure('public.process_billing_event(jsonb,text)') is not null then raise exception 'untrusted_billing'; end if;
  update public.polar_runtime set environment = 'sandbox';
  begin
    perform public.polar_reserve_checkout(owner, 'production', 'USD');
    raise exception 'wrong_environment_succeeded';
  exception when others then if sqlerrm <> 'polar_environment_mismatch' then raise; end if; end;
  ctx := public.billing_account_context(owner);
  if ctx->>'plan' <> 'free' or (ctx->>'hasBillingAccount')::boolean then raise exception 'wrong_initial_plan'; end if;
  free_period := ctx->>'periodId';
  attempt := public.polar_reserve_checkout(owner,'sandbox','PHP');
  retry := public.polar_reserve_checkout(owner,'sandbox','USD');
  if attempt->>'action' <> 'create' or retry->>'action' <> 'busy' or attempt->>'id' <> retry->>'id' then raise exception 'double_dispatch'; end if;
  if not public.polar_finish_checkout(owner,'sandbox',(attempt->>'id')::uuid,'open',checkout,'https://sandbox.polar.sh/example',now()+interval '1 hour')
    or public.polar_finish_checkout(other_owner,'sandbox',(attempt->>'id')::uuid,'failed') then raise exception 'wrong_checkout_owner'; end if;
  retry := public.polar_reserve_checkout(owner,'sandbox','PHP');
  if retry->>'action' <> 'reuse' or retry->>'checkoutId' <> checkout::text then raise exception 'lost_checkout'; end if;
  begin
    insert into public.account_data_requests(id,owner_id,kind) values(gen_random_uuid(),owner,'deletion');
    raise exception 'deletion_with_open_checkout';
  exception when others then if sqlerrm <> 'billing_must_close' then raise; end if; end;

  snapshot := jsonb_build_object('id',sub,'status','active','currentPeriodStart',started,
    'currentPeriodEnd',started + interval '1 month','cancelAtPeriodEnd',false);
  perform public.polar_sync_subscription(owner,'sandbox',customer,'checkout-paid',now(),snapshot);
  ctx := public.billing_account_context(owner);
  if ctx->>'plan' <> 'paid' or ctx->>'planVersion' <> '2' or ctx#>>'{limits,documentPages}' <> '500'
    or ctx#>>'{limits,chatMessages}' <> '300' or ctx#>>'{limits,transcriptionSeconds}' <> '36000'
    or ctx#>>'{subscription,status}' <> 'active' or ctx->>'hasBillingAccount' <> 'true'
    or (ctx->>'endsAt')::timestamptz <> started + interval '1 month' then raise exception 'wrong_pro_access'; end if;
  pro_period := ctx->>'periodId';
  if public.polar_sync_subscription(owner,'sandbox',customer,'checkout-paid',now()+interval '1 second','{}')
    or public.polar_sync_subscription(owner,'sandbox',customer,'older',now()-interval '1 second','{}')
    or public.billing_account_context(owner)->>'periodId' <> pro_period then raise exception 'replay_changed_access'; end if;
  if public.polar_reserve_checkout(owner,'sandbox','USD')->>'action' <> 'portal' then raise exception 'second_subscription'; end if;
  begin
    perform public.polar_sync_subscription(other_owner,'sandbox',customer,'different-owner',now(),snapshot);
    raise exception 'customer_transferred';
  exception when unique_violation then null; end;
  perform public.polar_sync_subscription(owner,'sandbox',customer,'cancel-renewal',now()+interval '1 second',
    snapshot || '{"cancelAtPeriodEnd":true}');
  if public.billing_account_context(owner)->>'periodId' <> pro_period then raise exception 'cancellation_cut_paid_period'; end if;
  perform public.polar_sync_subscription(owner,'sandbox',customer,'renewal',now()+interval '2 seconds',
    snapshot || jsonb_build_object('currentPeriodStart',now()-interval '1 second','currentPeriodEnd',now()+interval '1 month'));
  if public.billing_account_context(owner)->>'periodId' = pro_period then raise exception 'renewal_did_not_start_period'; end if;
  perform public.polar_sync_subscription(owner,'sandbox',customer,'revoked',now()+interval '3 seconds','{}');
  ctx := public.billing_account_context(owner);
  if ctx->>'plan' <> 'free' or ctx->>'periodId' <> free_period or ctx->>'subscription' is not null then raise exception 'wrong_revocation'; end if;
  insert into public.account_data_requests(id,owner_id,kind) values(gen_random_uuid(),owner,'deletion');
  begin
    perform public.polar_reserve_checkout(owner,'sandbox','USD');
    raise exception 'checkout_after_deletion';
  exception when others then if sqlerrm <> 'account_deleting' then raise; end if; end;
end $$;
rollback;
