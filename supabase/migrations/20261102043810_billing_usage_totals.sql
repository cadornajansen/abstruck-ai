create function public.billing_usage_totals(p_owner_id uuid,p_period_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'storageBytes',(select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id),
    'documentPages',coalesce(sum(units) filter(where feature='document_pages'),0),
    'transcriptionSeconds',coalesce(sum(units) filter(where feature='transcription_seconds'),0),
    'ocrPages',coalesce(sum(units) filter(where feature='ocr_pages'),0),
    'chatMessages',coalesce(sum(units) filter(where feature='chat'),0),
    'studySets',coalesce(sum(units) filter(where feature='study_set'),0))
  from public.usage_ledger where owner_id=p_owner_id and period_id=p_period_id and status<>'failed'
  having exists(select 1 from public.usage_periods where id=p_period_id and owner_id=p_owner_id);
$$;
revoke all on function public.billing_usage_totals(uuid,uuid) from public,anon,authenticated;
grant execute on function public.billing_usage_totals(uuid,uuid) to service_role;
