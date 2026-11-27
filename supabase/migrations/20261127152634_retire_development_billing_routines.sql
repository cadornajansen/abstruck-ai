-- Some development databases ran the unpublished Kelviq sandbox integration.
drop trigger if exists kelviq_fence_account_deletion on public.account_data_requests;
drop function if exists public.kelviq_fence_account_deletion(), public.kelviq_reserve_checkout(uuid,text,text,text),
  public.kelviq_finish_checkout(uuid,uuid,text,text,text,text), public.kelviq_sync_subscription(uuid,text,text,text,jsonb,uuid,jsonb);
