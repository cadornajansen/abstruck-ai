create function public.billing_active_operations(p_owner_id uuid,p_include_queued boolean default true)
returns integer language sql stable security invoker set search_path='' as $$
  select ((select count(*) from public.processing_jobs where owner_id=p_owner_id and
    ((state='queued' and p_include_queued) or (state='running' and lease_until>now())))+
    (select count(*) from public.usage_ledger where owner_id=p_owner_id and feature='chat' and status='reserved'
      and updated_at>now()-interval '3 minutes'))::integer;
$$;
revoke all on function public.billing_active_operations(uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_active_operations(uuid,boolean) to service_role;

create or replace function public.queue_study_generation(p_owner_id uuid,p_material_id uuid,p_request_id uuid,
  p_type text,p_settings jsonb,p_source_ids uuid[],p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.study_sets; source public.materials; job_id uuid; queue_message_id bigint;
  profile_created timestamptz; period_start timestamptz; period uuid; sources jsonb; billing jsonb;
begin
  select created_at into profile_created from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  if exists(select 1 from public.usage_ledger where id=p_request_id) then
    select s.* into result from public.study_sets s join public.processing_jobs j on j.study_set_id=s.id
      join public.generation_runs r on r.job_id=j.id where r.id=p_request_id and r.owner_id=p_owner_id
      and s.material_id=p_material_id and s.type=p_type and j.input->'settings'=p_settings
      and (select array_agg((src->>'id')::uuid order by src->>'id') from jsonb_array_elements(j.input->'sources') src)=
        (select array_agg(id order by id::text) from unnest(p_source_ids) id);
    if not found then raise exception 'request_conflict'; end if;
    return jsonb_build_object('studySetId',result.id,'status',result.status,'jobId',(select id from public.processing_jobs where study_set_id=result.id));
  end if;
  if p_type not in ('summary','flashcards','quiz','exam') or cardinality(p_source_ids) not between 1 and 3 or
    not(p_material_id=any(p_source_ids)) then raise exception 'invalid_generation'; end if;
  if p_type in ('quiz','exam') and ((p_settings->>'count')::integer not between 1 and case when p_type='exam' then 40 else 20 end
    or jsonb_typeof(p_settings->'questionTypes') is distinct from 'array' or jsonb_array_length(p_settings->'questionTypes') not between 1 and 5
    or exists(select 1 from jsonb_array_elements_text(p_settings->'questionTypes') t where t not in ('multiple_choice','multi_select','true_false','fill_blank','free_response'))
    or ((p_settings->>'durationMinutes')::integer is not null and (p_settings->>'durationMinutes')::integer not between 1 and 180))
    then raise exception 'invalid_generation'; end if;
  select * into source from public.materials where id=p_material_id and owner_id=p_owner_id and status in ('ready','partial');
  if not found then raise exception 'material_not_ready'; end if;
  if exists(select 1 from unnest(p_source_ids) requested(id) where not exists
    (select 1 from public.materials m where m.id=requested.id and m.owner_id=p_owner_id and m.status in ('ready','partial')))
    then raise exception 'source_not_ready'; end if;
  select jsonb_agg(jsonb_build_object('id',m.id,'version',m.extraction_version)) into sources from public.materials m where m.id=any(p_source_ids) and m.owner_id=p_owner_id;
  billing:=public.billing_account_context(p_owner_id);
  period:=(billing->>'periodId')::uuid;
  if public.billing_active_operations(p_owner_id,true) >= (billing->'limits'->>'concurrentJobs')::integer
    then raise exception 'job_concurrency_limit'; end if;
  if (select count(*) from public.usage_ledger where period_id=period and feature='study_set' and status<>'failed')>=(billing->'limits'->>'studySets')::integer
    then raise exception 'study_quota_exceeded'; end if;
  insert into public.study_sets(owner_id,material_id,space_id,type,title,status) values
    (p_owner_id,p_material_id,source.space_id,p_type,left(source.title,200)||' · '||initcap(p_type),'queued') returning * into result;
  insert into public.processing_jobs(owner_id,study_set_id,kind,input) values
    (p_owner_id,result.id,'generate_'||p_type,jsonb_build_object('sources',sources,'settings',p_settings)) returning id into job_id;
  insert into public.generation_runs(id,owner_id,job_id,operation,prompt_version)
    values(p_request_id,p_owner_id,job_id,p_type,case when p_type in ('quiz','exam') then 'assessment-v1' else 'study-v1' end);
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(p_request_id,p_owner_id,period,'study_set','reserved');
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job_id)) into queue_message_id;
  update public.processing_jobs set message_id=queue_message_id where id=job_id;
  return jsonb_build_object('studySetId',result.id,'jobId',job_id,'status','queued');
end $$;



create or replace function public.claim_study_job()
returns table(job_id uuid,lease_token uuid,study_set_id uuid,attempt_id uuid,owner_id uuid,type text,input jsonb,request_id uuid,cached_output jsonb,cached_usage jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; run public.generation_runs; billing jsonb;
begin
  for message in select * from pgmq.read('study_jobs',300,1) loop
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid;
    if not found then perform pgmq.delete('study_jobs',message.msg_id); return; end if;
    perform 1 from public.profiles where id=job.owner_id for update;
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id<>message.msg_id then perform pgmq.delete('study_jobs',message.msg_id); return; end if;
    select * into run from public.generation_runs where generation_runs.job_id=job.id for update;
    if job.attempt>=3 or (job.attempt>0 and run.output is null) then
      -- An uncertain provider effect is never automatically repeated.
      update public.processing_jobs set state='failed',error_code='generation_interrupted',updated_at=now() where id=job.id;
      if job.attempt_id is null then
        update public.study_sets set status='failed',error_code='generation_interrupted',updated_at=now() where id=job.study_set_id;
      else
        perform 1 from public.attempts where id=job.attempt_id and owner_id=job.owner_id for update;
        update public.answers set feedback=jsonb_build_object('status','review','score',null,'maxScore',1,
          'text','AI review was interrupted and needs review. It was not submitted to the provider again.','isAI',true)
          where grading_job_id=job.id and feedback->>'status'='pending';
        perform public.refresh_assessment_score(job.owner_id,job.attempt_id);
      end if;
      update public.generation_runs set status='uncertain',error_code='generation_interrupted' where id=run.id;
      update public.usage_ledger set status='uncertain',updated_at=now() where id=run.id;
      perform pgmq.delete('study_jobs',message.msg_id); return;
    end if;
    if run.output is null then
      billing:=public.billing_account_context(job.owner_id);
      if public.billing_active_operations(job.owner_id,false)>=(billing->'limits'->>'concurrentJobs')::integer then
        perform pgmq.set_vt('study_jobs',message.msg_id,15);
        return;
      end if;
    end if;
    token:=gen_random_uuid();
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,lease_until=message.vt,updated_at=now() where id=job.id;
    if job.study_set_id is not null then update public.study_sets set status='generating',updated_at=now() where id=job.study_set_id; end if;
    update public.generation_runs set status='running' where id=run.id;
    return query select job.id,token,job.study_set_id,job.attempt_id,job.owner_id,run.operation,job.input,run.id,run.output,run.usage;
  end loop;
end $$;
