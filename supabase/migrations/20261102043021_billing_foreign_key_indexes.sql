create index payment_orders_plan_idx on public.payment_orders(plan_id);
create index access_grants_order_owner_plan_idx on public.access_grants(order_id,owner_id,plan_id);
create index usage_periods_grant_owner_idx on public.usage_periods(grant_id,owner_id);
