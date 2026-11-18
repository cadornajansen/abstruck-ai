-- R-06 extends the immutable study items and existing review attempts.
alter table public.study_sets drop constraint study_sets_type_check;
alter table public.study_sets add constraint study_sets_type_check
  check(type in ('notes','summary','flashcards','quiz','exam'));
alter table public.attempts drop constraint attempts_mode_check;
alter table public.attempts add constraint attempts_mode_check check(mode in ('fast','spaced','quiz','exam'));
alter table public.attempts drop constraint attempts_state_check;
alter table public.attempts add constraint attempts_state_check check(state in ('active','grading','completed'));
alter table public.attempts add column deadline_at timestamptz;
alter table public.attempts add column submit_request_id uuid;
alter table public.attempts add column ai_grading boolean not null default false;
alter table public.attempts add column ai_period_start timestamptz;
alter table public.attempts add column ai_attempt_limit integer not null default 3 check(ai_attempt_limit between 1 and 3);
alter table public.attempts add column score numeric;
alter table public.attempts add unique(id,owner_id);
create index attempts_ai_period_idx on public.attempts(owner_id,study_set_id,ai_period_start) where ai_grading;

alter table public.processing_jobs add column attempt_id uuid;
alter table public.processing_jobs add constraint processing_jobs_attempt_owner_fkey
  foreign key(attempt_id,owner_id) references public.attempts(id,owner_id) on delete cascade;
alter table public.processing_jobs drop constraint processing_jobs_target_check;
alter table public.processing_jobs add constraint processing_jobs_target_check
  check((material_id is not null)::integer+(study_set_id is not null)::integer+(attempt_id is not null)::integer=1);
create index processing_jobs_attempt_owner_idx on public.processing_jobs(attempt_id,owner_id) where attempt_id is not null;

alter table public.answers add column revision integer not null default 0 check(revision>=0);
alter table public.answers add column final boolean not null default false;
alter table public.answers add column marked boolean not null default false;
alter table public.answers add column feedback jsonb;
alter table public.answers add column review_requested boolean not null default false;
alter table public.answers add column grading_job_id uuid references public.processing_jobs(id) on delete set null;
create index answers_grading_job_idx on public.answers(grading_job_id) where grading_job_id is not null;
grant update on public.answers to service_role;

-- Cached generation output may contain private question keys/rubrics.
revoke select on public.generation_runs from authenticated;
grant select(id,owner_id,job_id,operation,model,prompt_version,status,provider_request_id,usage,error_code,created_at)
  on public.generation_runs to authenticated;

create function public.assessment_normalize(p_text text)
returns text language sql immutable security invoker set search_path='' as $$
  select lower(regexp_replace(btrim(coalesce(p_text,'')),'\s+',' ','g'));
$$;

create function public.grade_objective_question(p_item public.study_items,p_response jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare correct boolean; answer_text text; status text; explanation text;
begin
  explanation:=coalesce(p_item.answer->>'explanation','');
  if p_item.prompt->>'type' in ('multiple_choice','multi_select','true_false') then
    select coalesce(array_agg(value order by value),'{}'::text[]) =
      (select coalesce(array_agg(value order by value),'{}'::text[]) from jsonb_array_elements_text(p_item.answer->'correctOptionIds'))
      into correct from jsonb_array_elements_text(coalesce(p_response->'selectedOptionIds','[]'));
    status:=case when correct then 'correct' else 'incorrect' end;
  elsif p_item.prompt->>'type'='fill_blank' then
    answer_text:=public.assessment_normalize(p_response->>'text');
    correct:=exists(select 1 from jsonb_array_elements_text(p_item.answer->'acceptedAnswers') a(value)
      where public.assessment_normalize(a.value)=answer_text);
    status:=case when correct then 'correct' when answer_text='' then 'incorrect' else 'review' end;
    if status='review' then explanation:='This response did not match an explicitly accepted answer. Review the accepted answers; no AI judgment was used.'; end if;
  else
    correct:=false; status:='incorrect';
  end if;
  return jsonb_build_object('status',status,'score',case when status='review' then null when correct then 1 else 0 end,
    'maxScore',1,'text',explanation,'isAI',false);
end $$;

create function public.refresh_assessment_score(p_owner_id uuid,p_attempt_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.attempts a set state='completed',score=(select coalesce(sum((r.feedback->>'score')::numeric),0)
      from public.answers r where r.attempt_id=a.id)
    where a.id=p_attempt_id and a.owner_id=p_owner_id and a.mode in ('quiz','exam') and a.submitted_at is not null
      and not exists(select 1 from public.answers r where r.attempt_id=a.id and r.feedback->>'status'='pending');
end $$;

create function public.assessment_attempt_payload(p_owner_id uuid,p_attempt_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('attemptId',a.id,'studySetId',a.study_set_id,'versionId',a.version_id,'title',s.title,
    'mode',a.mode,'state',a.state,'startedAt',a.started_at,'submittedAt',a.submitted_at,'deadlineAt',a.deadline_at,
    'serverNow',clock_timestamp(),'aiGrading',a.ai_grading,'aiAttemptLimit',a.ai_attempt_limit,
    'aiAttemptsRemaining',greatest(0,a.ai_attempt_limit-(select count(*) from public.attempts used
      where used.owner_id=a.owner_id and used.study_set_id=a.study_set_id and used.ai_grading and used.ai_period_start=a.ai_period_start)),
    'score',a.score,'maxScore',cardinality(a.card_ids),
    'reviewCount',(select count(*) from public.answers r where r.attempt_id=a.id and (r.feedback->>'status'='review' or r.review_requested)),
    'questions',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,
      'type',i.prompt->>'type','text',i.prompt->>'text','options',coalesce(i.prompt->'options','[]')) order by i.position),'[]')
      from public.study_items i where i.id=any(a.card_ids) and i.version_id=a.version_id and i.owner_id=a.owner_id and i.kind='question'),
    'answers',(select coalesce(jsonb_agg(jsonb_build_object('questionId',r.study_item_id,'response',r.response,
      'revision',r.revision,'final',r.final,'marked',r.marked,'reviewRequested',r.review_requested,
      'feedback',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then r.feedback end,
      'correctOptionIds',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then i.answer->'correctOptionIds' end,
      'acceptedAnswers',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then i.answer->'acceptedAnswers' end,
      'sampleAnswer',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then i.answer->>'sampleAnswer' end,
      'explanation',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then i.answer->>'explanation' end,
      'citations',case when a.submitted_at is not null or (a.mode='quiz' and r.final) then i.citations else '[]'::jsonb end) order by i.position),'[]')
      from public.answers r join public.study_items i on i.id=r.study_item_id and i.version_id=a.version_id and i.owner_id=a.owner_id
      where r.attempt_id=a.id))
  from public.attempts a join public.study_sets s on s.id=a.study_set_id and s.owner_id=a.owner_id
  where a.id=p_attempt_id and a.owner_id=p_owner_id and a.mode in ('quiz','exam');
$$;

create function public.queue_assessment_grading(p_owner_id uuid,p_attempt_id uuid,p_answer_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts; job_id uuid; run_id uuid:=gen_random_uuid(); period_id uuid; message_id bigint;
  selected uuid[]; sources jsonb; settings jsonb;
begin
  select * into attempt from public.attempts where id=p_attempt_id and owner_id=p_owner_id for update;
  if not found or not attempt.ai_grading then raise exception 'invalid_grading'; end if;
  select array_agg(id) into selected from public.answers where id=any(p_answer_ids) and attempt_id=attempt.id
    and owner_id=p_owner_id and final and grading_job_id is null and feedback->>'status'='pending';
  if selected is null then return; end if;
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(p_owner_id,attempt.ai_period_start,attempt.ai_period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into period_id;
  select jsonb_agg(jsonb_build_object('id',material_id,'version',extraction_version)) into sources
    from public.study_set_sources where version_id=attempt.version_id and owner_id=p_owner_id;
  select v.settings into settings from public.study_set_versions v where v.id=attempt.version_id and v.owner_id=p_owner_id;
  insert into public.processing_jobs(owner_id,attempt_id,kind,input) values(p_owner_id,attempt.id,'grade_assessment',
    jsonb_build_object('answerIds',selected,'sources',sources,'settings',settings)) returning id into job_id;
  insert into public.generation_runs(id,owner_id,job_id,operation,prompt_version) values(run_id,p_owner_id,job_id,'grade_assessment','assessment-grade-v1');
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(run_id,p_owner_id,period_id,'assessment_grading','reserved');
  update public.answers set grading_job_id=job_id where id=any(selected);
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job_id)) into message_id;
  update public.processing_jobs set message_id=queue_assessment_grading.message_id where id=job_id;
end $$;

create function public.start_assessment_attempt(p_owner_id uuid,p_study_set_id uuid,p_request_id uuid,p_objective_only boolean default false,p_ai_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; attempt public.attempts; version public.study_set_versions; selected uuid[];
  has_ai boolean; profile_created timestamptz; period_start timestamptz; duration integer;
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
  select created_at into profile_created from public.profiles where id=p_owner_id;
  period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
  if has_ai and (select count(*) from public.attempts where owner_id=p_owner_id and study_set_id=output.id and ai_grading and ai_period_start=period_start)>=p_ai_limit
    then return jsonb_build_object('error','ai_grading_limit','objectivePracticeAvailable',exists(select 1 from public.study_items where id=any(selected) and prompt->>'type'<>'free_response')); end if;
  duration:=(version.settings->>'durationMinutes')::integer;
  if duration is not null and duration not between 1 and 180 then return jsonb_build_object('error','invalid_timing'); end if;
  insert into public.attempts(owner_id,study_set_id,version_id,mode,card_ids,request_id,deadline_at,ai_grading,ai_period_start,ai_attempt_limit)
    values(p_owner_id,output.id,version.id,output.type,selected,p_request_id,
      case when duration is not null then clock_timestamp()+make_interval(mins=>duration) end,has_ai,period_start,p_ai_limit) returning * into attempt;
  return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
end $$;

create function public.submit_assessment_attempt(p_owner_id uuid,p_attempt_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts; item public.study_items; answer public.answers; pending uuid[]; result jsonb;
begin
  select * into attempt from public.attempts where id=p_attempt_id and owner_id=p_owner_id and mode in ('quiz','exam') for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if p_request_id is null then return jsonb_build_object('error','invalid_request'); end if;
  if attempt.submitted_at is not null then return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id)); end if;
  update public.attempts set submitted_at=least(clock_timestamp(),coalesce(deadline_at,clock_timestamp())),submit_request_id=p_request_id,state='grading'
    where id=attempt.id;
  for item in select * from public.study_items where id=any(attempt.card_ids) and owner_id=p_owner_id and version_id=attempt.version_id order by position loop
    insert into public.answers(owner_id,attempt_id,version_id,study_item_id,request_id,response)
      values(p_owner_id,attempt.id,attempt.version_id,item.id,gen_random_uuid(),'{}') on conflict(attempt_id,study_item_id) do nothing;
    select * into answer from public.answers where attempt_id=attempt.id and study_item_id=item.id for update;
    if answer.final then continue; end if;
    if item.prompt->>'type'='free_response' and length(btrim(coalesce(answer.response->>'text','')))>0 then
      result:=jsonb_build_object('status','pending','score',null,'maxScore',1,'text','AI review is queued.','isAI',true);
    else result:=public.grade_objective_question(item,answer.response); end if;
    update public.answers set final=true,feedback=result where id=answer.id;
  end loop;
  select array_agg(id) into pending from public.answers where attempt_id=attempt.id and feedback->>'status'='pending' and grading_job_id is null;
  if pending is not null then perform public.queue_assessment_grading(p_owner_id,attempt.id,pending); end if;
  perform public.refresh_assessment_score(p_owner_id,attempt.id);
  return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
end $$;

create function public.get_assessment_attempt(p_owner_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts;
begin
  select * into attempt from public.attempts where id=p_attempt_id and owner_id=p_owner_id and mode in ('quiz','exam') for update;
  if not found then return null; end if;
  if attempt.state='active' and attempt.deadline_at<=clock_timestamp() then
    perform public.submit_assessment_attempt(p_owner_id,attempt.id,attempt.id);
  end if;
  return public.assessment_attempt_payload(p_owner_id,attempt.id);
end $$;

create function public.save_assessment_answer(p_owner_id uuid,p_attempt_id uuid,p_question_id uuid,p_request_id uuid,
  p_revision integer,p_response jsonb,p_final boolean default false,p_marked boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts; item public.study_items; existing public.answers; answer_id uuid; result jsonb; choices text[];
begin
  if p_request_id is null or p_revision is null or p_revision not between 1 and 2147483646 or p_final is null or p_marked is null or
    p_response is null or jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>10000
    then return jsonb_build_object('error','invalid_request'); end if;
  select * into attempt from public.attempts where id=p_attempt_id and owner_id=p_owner_id and mode in ('quiz','exam') for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if attempt.state='active' and attempt.deadline_at<=clock_timestamp() then
    perform public.submit_assessment_attempt(p_owner_id,attempt.id,attempt.id);
    return jsonb_build_object('error','deadline_passed','attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
  end if;
  select * into existing from public.answers where attempt_id=attempt.id and study_item_id=p_question_id;
  if found then
    if p_revision<existing.revision then return jsonb_build_object('stale',true,'attempt',public.assessment_attempt_payload(p_owner_id,attempt.id)); end if;
    if p_revision=existing.revision then
      if existing.request_id=p_request_id and existing.response=p_response and existing.marked=p_marked and (not p_final or existing.final)
        then return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id)); end if;
      return jsonb_build_object('error','revision_conflict','attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
    end if;
    if existing.final then return jsonb_build_object('error','answer_locked','attempt',public.assessment_attempt_payload(p_owner_id,attempt.id)); end if;
  end if;
  if attempt.state<>'active' then return jsonb_build_object('error','attempt_submitted','attempt',public.assessment_attempt_payload(p_owner_id,attempt.id)); end if;
  if not(p_question_id=any(attempt.card_ids)) then return jsonb_build_object('error','invalid_question'); end if;
  if exists(select 1 from public.answers where owner_id=p_owner_id and request_id=p_request_id)
    then return jsonb_build_object('error','request_conflict'); end if;
  select * into item from public.study_items where id=p_question_id and version_id=attempt.version_id and owner_id=p_owner_id and kind='question';
  if not found then return jsonb_build_object('error','invalid_question'); end if;
  if item.prompt->>'type' in ('multiple_choice','multi_select','true_false') then
    if jsonb_typeof(p_response->'selectedOptionIds') is distinct from 'array' or (p_response-'selectedOptionIds')<>'{}'::jsonb
      then return jsonb_build_object('error','invalid_response'); end if;
    select array_agg(value) into choices from jsonb_array_elements_text(p_response->'selectedOptionIds');
    if coalesce(cardinality(choices),0)>6 or (item.prompt->>'type'<>'multi_select' and coalesce(cardinality(choices),0)>1)
      or (select count(*) from unnest(choices))<>(select count(distinct value) from unnest(choices) value)
      or exists(select 1 from unnest(choices) choice where not exists(select 1 from jsonb_array_elements(item.prompt->'options') option where option->>'id'=choice))
      then return jsonb_build_object('error','invalid_response'); end if;
  else
    if jsonb_typeof(p_response->'text') is distinct from 'string' or length(p_response->>'text')>2000 or (p_response-'text')<>'{}'::jsonb
      then return jsonb_build_object('error','invalid_response'); end if;
  end if;
  if p_final and attempt.mode='quiz' then
    if item.prompt->>'type'='free_response' and length(btrim(p_response->>'text'))>0 then
      result:=jsonb_build_object('status','pending','score',null,'maxScore',1,'text','AI review is queued.','isAI',true);
    else result:=public.grade_objective_question(item,p_response); end if;
  end if;
  insert into public.answers(owner_id,attempt_id,version_id,study_item_id,request_id,response,revision,final,marked,feedback)
    values(p_owner_id,attempt.id,attempt.version_id,p_question_id,p_request_id,p_response,p_revision,p_final and attempt.mode='quiz',p_marked,result)
    on conflict(attempt_id,study_item_id) do update set request_id=excluded.request_id,response=excluded.response,revision=excluded.revision,
      final=excluded.final,marked=excluded.marked,feedback=excluded.feedback returning id into answer_id;
  if result->>'status'='pending' then perform public.queue_assessment_grading(p_owner_id,attempt.id,array[answer_id]); end if;
  return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,attempt.id));
end $$;

create function public.report_assessment_answer(p_owner_id uuid,p_attempt_id uuid,p_question_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.attempts where id=p_attempt_id and owner_id=p_owner_id and mode in ('quiz','exam') for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  update public.answers set review_requested=true where attempt_id=p_attempt_id and owner_id=p_owner_id and study_item_id=p_question_id and final;
  if not found then return jsonb_build_object('error','answer_not_checked'); end if;
  return jsonb_build_object('attempt',public.assessment_attempt_payload(p_owner_id,p_attempt_id));
end $$;

create or replace function public.queue_study_generation(p_owner_id uuid,p_material_id uuid,p_request_id uuid,
  p_type text,p_settings jsonb,p_source_ids uuid[],p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.study_sets; source public.materials; job_id uuid; queue_message_id bigint;
  profile_created timestamptz; period_start timestamptz; period uuid; sources jsonb;
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
  period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(p_owner_id,period_start,period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into period;
  if (select count(*) from public.usage_ledger where period_id=period and feature='study_set' and status<>'failed')>=p_limit
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

-- Keep the established summary/flashcard persistence path intact.
alter function public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb) rename to finish_study_generation_v1;
create function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; output public.study_sets; new_version uuid; run_id uuid; question record; citation record; safe_content jsonb;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<clock_timestamp() then return false; end if;
  if job.kind='grade_assessment' then
    perform 1 from public.attempts where id=job.attempt_id and owner_id=job.owner_id for update;
    if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards)<>jsonb_array_length(job.input->'answerIds') then raise exception 'invalid_grading'; end if;
    if exists(select 1 from jsonb_array_elements(p_cards) grade where not exists(select 1 from public.answers a
      where a.id=(grade->>'answerId')::uuid and a.grading_job_id=job.id and a.attempt_id=job.attempt_id and a.owner_id=job.owner_id)
      or grade->'feedback'->>'status' not in ('correct','incorrect','review')
      or (grade->'feedback'->>'score')::numeric not between 0 and 1
      or jsonb_typeof(grade->'feedback'->'text') is distinct from 'string'
      or length(grade->'feedback'->>'text')>1500)
      or (select count(distinct grade->>'answerId') from jsonb_array_elements(p_cards) grade)<>jsonb_array_length(p_cards)
      then raise exception 'invalid_grading'; end if;
    update public.answers a set feedback=(grade.value->'feedback')||jsonb_build_object('isAI',true,'maxScore',1)
      from jsonb_array_elements(p_cards) grade(value)
      where a.id=(grade.value->>'answerId')::uuid and a.grading_job_id=job.id and a.owner_id=job.owner_id and a.feedback->>'status'='pending';
    perform public.refresh_assessment_score(job.owner_id,job.attempt_id);
  else
    select * into output from public.study_sets where id=job.study_set_id and owner_id=job.owner_id for update;
    if output.type not in ('quiz','exam') then return public.finish_study_generation_v1(p_job_id,p_lease_token,p_content,p_cards,p_usage); end if;
    if exists(select 1 from jsonb_to_recordset(job.input->'sources') src(id uuid,version integer)
      where not exists(select 1 from public.materials m where m.id=src.id and m.owner_id=job.owner_id and m.extraction_version=src.version and m.status in ('ready','partial')))
      then raise exception 'source_changed'; end if;
    if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) not between 1 and (job.input->'settings'->>'count')::integer then raise exception 'invalid_questions'; end if;
    for question in select value from jsonb_array_elements(p_cards) loop
      if question.value->>'type' not in ('multiple_choice','multi_select','true_false','fill_blank','free_response')
        or length(btrim(question.value->>'text')) not between 1 and 1000 or length(question.value->>'explanation') not between 1 and 1500
        or jsonb_typeof(question.value->'citations') is distinct from 'array' or jsonb_array_length(question.value->'citations') not between 1 and 5
        then raise exception 'invalid_question'; end if;
      for citation in select value from jsonb_array_elements(question.value->'citations') loop
        if not exists(select 1 from public.source_segments s join jsonb_to_recordset(job.input->'sources') src(id uuid,version integer)
          on src.id=s.material_id and src.version=s.extraction_version where s.id=(citation.value->>'segment_id')::uuid and s.owner_id=job.owner_id
          and s.material_id=(citation.value->>'material_id')::uuid and s.ordinal=(citation.value->>'page')::integer
          and length(citation.value->>'quote')>0 and strpos(s.text,citation.value->>'quote')>0) then raise exception 'invalid_citation'; end if;
      end loop;
    end loop;
    safe_content:=jsonb_build_object('description',left(coalesce(p_content->>'description',''),500),'questionCount',jsonb_array_length(p_cards));
    insert into public.study_set_versions(study_set_id,owner_id,version,content,settings)
      values(output.id,job.owner_id,1,safe_content,job.input->'settings') returning id into new_version;
    insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
      select new_version,src.id,job.owner_id,src.version from jsonb_to_recordset(job.input->'sources') src(id uuid,version integer);
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,rubric,citations)
      select new_version,job.owner_id,q.ordinality::integer,'question',
        jsonb_build_object('type',q.value->>'type','text',q.value->>'text','options',q.value->'options'),
        jsonb_build_object('correctOptionIds',q.value->'correctOptionIds','acceptedAnswers',q.value->'acceptedAnswers',
          'sampleAnswer',q.value->>'sampleAnswer','explanation',q.value->>'explanation'),
        jsonb_build_object('criteria',q.value->>'rubric','version','assessment-grade-v1'),q.value->'citations'
      from jsonb_array_elements(p_cards) with ordinality q;
    update public.study_sets set status='ready',draft_content=safe_content,draft_revision=draft_revision+1,error_code=null,updated_at=now() where id=output.id;
  end if;
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status='succeeded',output=null,model=p_usage->>'model',provider_request_id=p_usage->>'id',usage=p_usage where id=run_id;
  update public.usage_ledger set status='succeeded',model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id);
  return true;
end $$;

create function public.assessment_grading_input(p_job_id uuid,p_lease_token uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_agg(jsonb_build_object('answerId',a.id,'question',i.prompt,'response',a.response,'sampleAnswer',i.answer->>'sampleAnswer',
    'rubric',i.rubric,'citations',i.citations) order by i.position)
  from public.processing_jobs j join public.answers a on a.grading_job_id=j.id and a.attempt_id=j.attempt_id and a.owner_id=j.owner_id
    join public.study_items i on i.id=a.study_item_id and i.version_id=a.version_id and i.owner_id=a.owner_id
  where j.id=p_job_id and j.lease_token=p_lease_token and j.state='running' and j.lease_until>=clock_timestamp()
    and j.kind='grade_assessment' and a.final and a.feedback->>'status'='pending' and i.prompt->>'type'='free_response';
$$;

alter function public.fail_study_job(uuid,uuid,text,boolean,jsonb) rename to fail_study_generation_v1;
create function public.fail_study_job(p_job_id uuid,p_lease_token uuid,p_error text,p_uncertain boolean,p_usage jsonb default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run_id uuid;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<clock_timestamp() then return false; end if;
  if job.attempt_id is null then return public.fail_study_generation_v1(p_job_id,p_lease_token,p_error,p_uncertain,p_usage); end if;
  perform 1 from public.attempts where id=job.attempt_id and owner_id=job.owner_id for update;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  update public.answers set feedback=jsonb_build_object('status','review','score',null,'maxScore',1,
    'text','AI review could not finish. This response needs review; no automatic retry will spend another evaluation.','isAI',true)
    where grading_job_id=job.id and feedback->>'status'='pending';
  perform public.refresh_assessment_score(job.owner_id,job.attempt_id);
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status=case when p_uncertain then 'uncertain' else 'failed' end,error_code=left(p_error,80),usage=p_usage where id=run_id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,
    model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id);
  return true;
end $$;

drop function public.claim_study_job();
create function public.claim_study_job()
returns table(job_id uuid,lease_token uuid,study_set_id uuid,attempt_id uuid,owner_id uuid,type text,input jsonb,request_id uuid,cached_output jsonb,cached_usage jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; run public.generation_runs;
begin
  for message in select * from pgmq.read('study_jobs',300,1) loop
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
    token:=gen_random_uuid();
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,lease_until=message.vt,updated_at=now() where id=job.id;
    if job.study_set_id is not null then update public.study_sets set status='generating',updated_at=now() where id=job.study_set_id; end if;
    update public.generation_runs set status='running' where id=run.id;
    return query select job.id,token,job.study_set_id,job.attempt_id,job.owner_id,run.operation,job.input,run.id,run.output,run.usage;
  end loop;
end $$;

revoke all on function public.assessment_normalize(text),public.grade_objective_question(public.study_items,jsonb),
  public.refresh_assessment_score(uuid,uuid),public.assessment_attempt_payload(uuid,uuid),public.queue_assessment_grading(uuid,uuid,uuid[]),
  public.start_assessment_attempt(uuid,uuid,uuid,boolean,integer),public.submit_assessment_attempt(uuid,uuid,uuid),
  public.get_assessment_attempt(uuid,uuid),public.save_assessment_answer(uuid,uuid,uuid,uuid,integer,jsonb,boolean,boolean),
  public.report_assessment_answer(uuid,uuid,uuid),public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),
  public.assessment_grading_input(uuid,uuid),public.fail_study_job(uuid,uuid,text,boolean,jsonb),public.claim_study_job()
  from public,anon,authenticated;
grant execute on function public.assessment_normalize(text),public.grade_objective_question(public.study_items,jsonb),
  public.refresh_assessment_score(uuid,uuid),public.assessment_attempt_payload(uuid,uuid),public.queue_assessment_grading(uuid,uuid,uuid[]),
  public.start_assessment_attempt(uuid,uuid,uuid,boolean,integer),public.submit_assessment_attempt(uuid,uuid,uuid),
  public.get_assessment_attempt(uuid,uuid),public.save_assessment_answer(uuid,uuid,uuid,uuid,integer,jsonb,boolean,boolean),
  public.report_assessment_answer(uuid,uuid,uuid),public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),
  public.assessment_grading_input(uuid,uuid),public.fail_study_job(uuid,uuid,text,boolean,jsonb),public.claim_study_job()
  to service_role;
