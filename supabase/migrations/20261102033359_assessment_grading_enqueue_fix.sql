create or replace function public.queue_assessment_grading(p_owner_id uuid,p_attempt_id uuid,p_answer_ids uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts; job_id uuid; run_id uuid:=gen_random_uuid(); period_id uuid; queued_message_id bigint;
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
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job_id)) into queued_message_id;
  update public.processing_jobs set message_id=queued_message_id where id=job_id;
end $$;
