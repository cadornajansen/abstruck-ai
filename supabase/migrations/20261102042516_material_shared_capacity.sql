create or replace function public.queue_material(p_owner_id uuid,p_material_id uuid,p_retry boolean default false)
returns public.materials language plpgsql security invoker set search_path='' as $$
declare result public.materials; job_id uuid; msg_id bigint; account jsonb;
begin
  account:=public.billing_account_context(p_owner_id);
  select * into result from public.materials where id=p_material_id and owner_id=p_owner_id for update;
  if not found then raise exception 'material_not_found'; end if;
  if result.status<>'awaiting_upload' and not(p_retry and result.status='failed') then return result; end if;
  if public.billing_active_operations(p_owner_id,true)>=(account->'limits'->>'concurrentJobs')::integer then raise exception 'concurrent_job_limit'; end if;
  update public.assets set uploaded_at=coalesce(uploaded_at,now()) where material_id=result.id and role='original';
  insert into public.processing_jobs(material_id,owner_id) values(result.id,p_owner_id)
    on conflict(material_id) do update set state='queued',attempt=0,error_code=null,lease_token=null,lease_until=null,updated_at=now()
    returning id into job_id;
  select pgmq.send('material_jobs',jsonb_build_object('job_id',job_id)) into msg_id;
  update public.processing_jobs set message_id=msg_id where id=job_id;
  update public.materials set status='queued',error_code=null,updated_at=now() where id=result.id returning * into result;
  return result;
end $$;


create or replace function public.claim_material_job(p_visibility_seconds integer default 600)
returns table(job_id uuid,lease_token uuid,material_id uuid,owner_id uuid,object_key text,bytes bigint,source_type text,source_sha256 text,input jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; owner uuid; account jsonb; cached_publication boolean;
begin
  if p_visibility_seconds not between 60 and 600 then raise exception 'invalid_visibility'; end if;
  for message in select * from pgmq.read('material_jobs',p_visibility_seconds,1) loop
    select j.owner_id into owner from public.processing_jobs j where j.id=(message.message->>'job_id')::uuid;
    if owner is null then perform pgmq.delete('material_jobs',message.msg_id); return; end if;
    account:=public.billing_account_context(owner);
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id<>message.msg_id then
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    if job.attempt>=3 then
      update public.processing_jobs set state='failed',error_code='retry_limit',updated_at=now() where id=job.id;
      update public.materials set status='failed',error_code='retry_limit',updated_at=now() where id=job.material_id;
      update public.usage_ledger set status=case when reserved_cost_usd>0 then 'uncertain' else 'failed' end,updated_at=now()
        where processing_job_id=job.id;
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    -- Finishing checkpointed output needs no additional provider slot.
    cached_publication:=exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='document_pages')
      and not exists(select 1 from public.usage_ledger where processing_job_id=job.id and feature='ocr_pages'
        and units>(select count(*) from jsonb_each(coalesce(job.input->'ocr','{}'::jsonb))));
    if not cached_publication and public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
      perform pgmq.set_vt('material_jobs',message.msg_id,15); return;
    end if;
    token:=gen_random_uuid();
    job.input:=job.input||jsonb_build_object('lease_started_at',now());
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
    update public.materials set status='extracting',updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,a.object_key,a.bytes,m.source_type,a.source_sha256,job.input
      from public.assets a join public.materials m on m.id=a.material_id where a.material_id=job.material_id and a.role='original';
  end loop;
end $$;

