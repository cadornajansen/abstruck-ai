-- Continue past deferred/stale material messages without weakening leases or quotas.
CREATE OR REPLACE FUNCTION public.claim_material_job(p_visibility_seconds integer DEFAULT 600, p_include_index boolean DEFAULT false, p_index_material_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(job_id uuid, lease_token uuid, material_id uuid, owner_id uuid, object_key text, bytes bigint, source_type text, source_sha256 text, input jsonb)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare inspected integer; message record; job public.processing_jobs; token uuid; owner uuid; account jsonb; cached_publication boolean; media_submitted boolean;
begin
  if p_visibility_seconds not between 60 and 600 then raise exception 'invalid_visibility'; end if;
  -- Read one message at a time: deferred work must not hide later runnable jobs.
  -- Bound the scan so a queue of ineligible jobs cannot hold this RPC indefinitely.
  for inspected in 1..32 loop
    select * into message from pgmq.read('material_jobs',p_visibility_seconds,1);
    if not found then return; end if;
    select j.owner_id into owner from public.processing_jobs j where j.id=(message.message->>'job_id')::uuid;
    if owner is null then perform pgmq.delete('material_jobs',message.msg_id); continue; end if;
    account:=public.billing_account_context(owner);
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id<>message.msg_id then
      perform pgmq.delete('material_jobs',message.msg_id); continue;
    end if;
    if job.kind='index_material' then
      if not p_include_index or (p_index_material_ids is not null and not(job.material_id=any(p_index_material_ids))) then
        perform pgmq.set_vt('material_jobs',message.msg_id,15); continue;
      end if;
      if job.input->'source_index'->'batch'->>'state'='submitted' then
        update public.processing_jobs set state='failed',lease_until=null,error_code='embedding_result_unconfirmed',
          input=jsonb_set(input,'{source_index,state}','"uncertain"'::jsonb),updated_at=now() where id=job.id;
        update public.usage_ledger set status='uncertain',updated_at=now() where processing_job_id=job.id and feature='material_embeddings:'||(job.input->'source_index'->>'extraction_version');
        perform pgmq.delete('material_jobs',message.msg_id); continue;
      end if;
      if not exists(select 1 from public.materials m where m.id=job.material_id and m.owner_id=owner and m.status in ('ready','partial')
        and m.extraction_version=(job.input->'source_index'->>'extraction_version')::integer) then
        update public.processing_jobs set state='failed',lease_until=null,error_code='stale_index',updated_at=now() where id=job.id;
        perform pgmq.delete('material_jobs',message.msg_id); continue;
      end if;
      if public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
        perform pgmq.set_vt('material_jobs',message.msg_id,15); continue;
      end if;
      token:=gen_random_uuid();
      job.input:=job.input||jsonb_build_object('lease_started_at',now());
      update public.processing_jobs set state='running',lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
      return query select job.id,token,job.material_id,owner,''::text,0::bigint,'index_material'::text,null::text,job.input;
      return;
    end if;
    media_submitted:=exists(select 1 from public.transcription_runs r where r.job_id=job.id and r.submitted_at is not null);
    if job.attempt>=3 and not media_submitted then
      update public.processing_jobs set state='failed',error_code='retry_limit',updated_at=now() where id=job.id;
      update public.materials set status='failed',error_code='retry_limit',updated_at=now() where id=job.material_id;
      update public.usage_ledger set status=case when reserved_cost_usd>0 then 'uncertain' else 'failed' end,updated_at=now()
        where processing_job_id=job.id;
      perform pgmq.delete('material_jobs',message.msg_id); continue;
    end if;
    -- Finishing checkpointed output needs no additional provider slot.
    cached_publication:=exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages')
      and not exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='ocr_pages'
        and units>(select count(*) from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb))));
    if not cached_publication and not media_submitted and public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
      perform pgmq.set_vt('material_jobs',message.msg_id,15); continue;
    end if;
    token:=gen_random_uuid();
    job.input:=job.input||jsonb_build_object('lease_started_at',now());
    update public.processing_jobs set state='running',attempt=attempt+case when media_submitted then 0 else 1 end,lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
    update public.materials set status=case when media_submitted then 'transcribing' else 'extracting' end,updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,coalesce(a.object_key,''),coalesce(a.bytes,0::bigint),m.source_type,a.source_sha256,job.input
      from public.materials m left join public.assets a on a.material_id=m.id and a.role='original'
      where m.id=job.material_id and (m.source_type='youtube' or a.id is not null);
    return;
  end loop;
end $function$;
