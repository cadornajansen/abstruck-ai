alter table public.generation_runs add column output jsonb;

create function public.checkpoint_study_generation(p_job_id uuid,p_lease_token uuid,p_payload jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run_id uuid;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.generation_runs set output=p_payload,usage=p_usage,model=p_usage->>'model',provider_request_id=p_usage->>'id'
    where job_id=job.id returning id into run_id;
  update public.usage_ledger set model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  return true;
end $$;

create function public.recover_study_save(p_owner_id uuid,p_study_set_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run public.generation_runs; queue_message_id bigint;
begin
  select * into job from public.processing_jobs where study_set_id=p_study_set_id and owner_id=p_owner_id for update;
  if not found then return false; end if;
  if job.state='succeeded' then return true; end if;
  select * into run from public.generation_runs where job_id=job.id;
  if run.output is null then return false; end if;
  perform pgmq.delete('study_jobs',job.message_id);
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job.id)) into queue_message_id;
  update public.processing_jobs set state='queued',attempt=0,lease_token=null,lease_until=null,error_code=null,
    message_id=queue_message_id,updated_at=now() where id=job.id;
  update public.study_sets set status='queued',error_code=null,updated_at=now() where id=p_study_set_id;
  update public.generation_runs set status='queued',error_code=null where id=run.id;
  update public.usage_ledger set status='reserved',updated_at=now() where id=run.id;
  return true;
end $$;

create or replace function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; output public.study_sets; new_version_id uuid; run_id uuid; citation record; source record;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  select * into output from public.study_sets where id=job.study_set_id for update;
  if not found then return false; end if;
  if exists(select 1 from jsonb_to_recordset(job.input->'sources') as src(id uuid,version integer)
    where not exists(select 1 from public.materials m where m.id=src.id and m.owner_id=job.owner_id and m.extraction_version=src.version and m.status in ('ready','partial')))
    then raise exception 'source_changed'; end if;
  if output.type='summary' and (coalesce(length(p_content->>'markdown'),0) not between 1 and 20000 or jsonb_array_length(p_content->'citations')<1)
    then raise exception 'invalid_summary'; end if;
  if output.type='flashcards' and (jsonb_typeof(p_cards)<>'array' or jsonb_array_length(p_cards) not between 1 and 30)
    then raise exception 'invalid_cards'; end if;
  for citation in select value from jsonb_array_elements(case when output.type='summary' then p_content->'citations'
    else (select coalesce(jsonb_agg(c.value),'[]') from jsonb_array_elements(p_cards) card cross join lateral jsonb_array_elements(card->'citations') c) end) loop
    if not exists(select 1 from public.source_segments s join jsonb_to_recordset(job.input->'sources') as src(id uuid,version integer)
      on src.id=s.material_id and src.version=s.extraction_version where s.id=(citation.value->>'segment_id')::uuid and s.owner_id=job.owner_id
      and s.material_id=(citation.value->>'material_id')::uuid and s.ordinal=(citation.value->>'page')::integer
      and length(citation.value->>'quote')>0 and strpos(s.text,citation.value->>'quote')>0) then raise exception 'invalid_citation'; end if;
  end loop;
  insert into public.study_set_versions(study_set_id,owner_id,version,content,settings)
    values(output.id,job.owner_id,1,p_content,job.input->'settings') returning id into new_version_id;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
    select new_version_id,src.id,job.owner_id,src.version from jsonb_to_recordset(job.input->'sources') as src(id uuid,version integer);
  if output.type='flashcards' then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,citations)
      select new_version_id,job.owner_id,card.ordinality::integer,'flashcard',jsonb_build_object('front',card.value->>'front','hint',card.value->>'hint'),
        jsonb_build_object('back',card.value->>'back','explanation',card.value->>'explanation'),card.value->'citations'
      from jsonb_array_elements(p_cards) with ordinality card;
  end if;
  update public.study_sets set status='ready',draft_content=p_content,draft_revision=draft_revision+1,error_code=null,updated_at=now() where id=output.id;
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status='succeeded',output=null,model=p_usage->>'model',provider_request_id=p_usage->>'id',usage=p_usage where id=run_id;
  update public.usage_ledger set status='succeeded',model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id);
  return true;
end $$;

drop function public.claim_study_job();
create function public.claim_study_job()
returns table(job_id uuid,lease_token uuid,study_set_id uuid,owner_id uuid,type text,input jsonb,request_id uuid,cached_output jsonb,cached_usage jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; run public.generation_runs;
begin
  for message in select * from pgmq.read('study_jobs',300,1) loop
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') then perform pgmq.delete('study_jobs',message.msg_id); return; end if;
    select * into run from public.generation_runs where generation_runs.job_id=job.id for update;
    if job.attempt>=3 or (job.attempt>0 and run.output is null) then
      -- A crashed generation may have reached the provider. Do not silently spend again.
      update public.processing_jobs set state='failed',error_code='generation_interrupted',updated_at=now() where id=job.id;
      update public.study_sets set status='failed',error_code='generation_interrupted',updated_at=now() where id=job.study_set_id;
      update public.generation_runs set status='uncertain',error_code='generation_interrupted' where id=run.id;
      update public.usage_ledger set status='uncertain',updated_at=now() where id=run.id;
      perform pgmq.delete('study_jobs',message.msg_id); return;
    end if;
    token:=gen_random_uuid();
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,lease_until=message.vt,updated_at=now() where id=job.id;
    update public.study_sets set status='generating',updated_at=now() where id=job.study_set_id;
    update public.generation_runs set status='running' where id=run.id;
    return query select job.id,token,job.study_set_id,job.owner_id,run.operation,job.input,run.id,run.output,run.usage;
  end loop;
end $$;

revoke all on function public.checkpoint_study_generation(uuid,uuid,jsonb,jsonb),public.recover_study_save(uuid,uuid),public.claim_study_job()
  from public,anon,authenticated;
grant execute on function public.checkpoint_study_generation(uuid,uuid,jsonb,jsonb),public.recover_study_save(uuid,uuid),public.claim_study_job()
  to service_role;

