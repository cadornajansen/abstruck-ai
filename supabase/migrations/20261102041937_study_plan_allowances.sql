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
  if (select count(*) from public.processing_jobs where owner_id=p_owner_id and state in ('queued','running')) >= (billing->'limits'->>'concurrentJobs')::integer
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


create or replace function public.start_assessment_attempt(p_owner_id uuid,p_study_set_id uuid,p_request_id uuid,p_objective_only boolean default false,p_ai_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; attempt public.attempts; version public.study_set_versions; selected uuid[];
  has_ai boolean; profile_created timestamptz; period_start timestamptz; duration integer; billing jsonb;
begin
  if p_request_id is null or p_objective_only is null or p_ai_limit not between 1 and 3 then return jsonb_build_object('error','invalid_request'); end if;
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type in ('quiz','exam') for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into attempt from public.attempts where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if attempt.study_set_id<>output.id or attempt.mode<>output.type then return jsonb_build_object('error','request_conflict'); end if;
    return jsonb_build_object('attempt',public.get_assessment_attempt(p_owner_id,attempt.id));
  end if;
  select * into attempt from public.attempts where owner_id=p_owner_id and study_set_id=output.id and mode=output.type and state in ('active','grading') order by started_at desc limit 1;
  if found then return jsonb_build_object('attempt',public.get_assessment_attempt(p_owner_id,attempt.id)); end if;
  if output.status<>'ready' then return jsonb_build_object('error','not_ready'); end if;
  select * into version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id order by version desc limit 1;
  select array_agg(id order by position),bool_or(prompt->>'type'='free_response') into selected,has_ai from public.study_items
    where version_id=version.id and owner_id=p_owner_id and kind='question' and (not p_objective_only or prompt->>'type'<>'free_response');
  if selected is null then return jsonb_build_object('error','no_objective_questions'); end if;
  billing:=public.billing_account_context(p_owner_id);
  period_start:=(billing->>'startsAt')::timestamptz;
  if has_ai and (select count(*) from public.attempts where owner_id=p_owner_id and study_set_id=output.id and ai_grading and ai_period_start=period_start)>=p_ai_limit
    then return jsonb_build_object('error','ai_grading_limit','objectivePracticeAvailable',exists(select 1 from public.study_items where id=any(selected) and prompt->>'type'<>'free_response')); end if;
  duration:=(version.settings->>'durationMinutes')::integer;
  if duration is not null and duration not between 1 and 180 then return jsonb_build_object('error','invalid_timing'); end if;
  insert into public.attempts(owner_id,study_set_id,version_id,mode,card_ids,request_id,deadline_at,ai_grading,ai_period_start,ai_attempt_limit)
    values(p_owner_id,output.id,version.id,output.type,selected,p_request_id,
      case when duration is not null then clock_timestamp()+make_interval(mins=>duration) end,has_ai,period_start,p_ai_limit) returning * into attempt;
  return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
end $$;
