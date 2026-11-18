create or replace function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; output public.study_sets; new_version_id uuid; run_id uuid; citation jsonb; settings jsonb; conversation boolean; novel boolean;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<clock_timestamp() then return false; end if;
  if job.kind='grade_assessment' then return public.finish_study_before_outputs(p_job_id,p_lease_token,p_content,p_cards,p_usage); end if;
  select * into output from public.study_sets where id=job.study_set_id and owner_id=job.owner_id for update;
  novel:=output.type in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart');
  conversation:=job.input->>'inputKind'='conversation';
  if not novel and not coalesce(conversation,false) then return public.finish_study_before_outputs(p_job_id,p_lease_token,p_content,p_cards,p_usage); end if;
  if exists(select 1 from jsonb_to_recordset(job.input->'sources') src(id uuid,version integer) where not exists(select 1 from public.materials m
    where m.id=src.id and m.owner_id=job.owner_id and m.extraction_version=src.version and m.status in ('ready','partial'))) then raise exception 'source_changed'; end if;
  if novel and (p_content->>'kind' is distinct from output.type or p_content->>'inputKind' is distinct from job.input->>'inputKind' or p_content->>'formatVersion'<>'1' or
    length(p_content->>'title') not between 1 and 140 or jsonb_typeof(p_content->'citations') is distinct from 'array') then raise exception 'invalid_study_output'; end if;
  if output.type='summary' and coalesce(length(p_content->>'markdown'),0) not between 1 and 20000 then raise exception 'invalid_summary'; end if;
  if output.type in ('flashcards','quiz','exam') and (jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) not between 1 and (job.input->'settings'->>'count')::integer) then raise exception 'invalid_items'; end if;
  for citation in select value from jsonb_path_query(jsonb_build_object('content',p_content,'items',p_cards),'$.**.citations[*]') value loop
    if conversation or not exists(select 1 from public.source_segments s join jsonb_to_recordset(job.input->'sources') src(id uuid,version integer) on src.id=s.material_id and src.version=s.extraction_version
      where s.id=(citation->>'segment_id')::uuid and s.owner_id=job.owner_id and s.material_id=(citation->>'material_id')::uuid and s.ordinal=(citation->>'page')::integer and
      length(citation->>'quote')>0 and strpos(s.text,citation->>'quote')>0) then raise exception 'invalid_citation'; end if;
  end loop;
  if output.type in ('podcast','video') and not exists(select 1 from public.assets where study_set_id=output.id and owner_id=job.owner_id and uploaded_at is not null and
    role=case when output.type='podcast' then 'study_audio' else 'study_video' end) then raise exception 'study_artifact_missing'; end if;
  settings:=(job.input->'settings')||jsonb_build_object('inputKind',job.input->>'inputKind');
  insert into public.study_set_versions(study_set_id,owner_id,version,content,settings) values(output.id,job.owner_id,1,p_content,settings) returning id into new_version_id;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version) select new_version_id,src.id,job.owner_id,src.version from jsonb_to_recordset(job.input->'sources') src(id uuid,version integer);
  if output.type='flashcards' then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,citations)
      select new_version_id,job.owner_id,q.ordinality::integer,'flashcard',jsonb_build_object('front',q.value->>'front','hint',q.value->>'hint'),
        jsonb_build_object('back',q.value->>'back','explanation',q.value->>'explanation'),q.value->'citations' from jsonb_array_elements(p_cards) with ordinality q;
  elsif output.type in ('quiz','exam') then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,rubric,citations)
      select new_version_id,job.owner_id,q.ordinality::integer,'question',jsonb_build_object('type',q.value->>'type','text',q.value->>'text','options',q.value->'options'),
        jsonb_build_object('correctOptionIds',q.value->'correctOptionIds','acceptedAnswers',q.value->'acceptedAnswers','sampleAnswer',q.value->>'sampleAnswer','explanation',q.value->>'explanation'),
        jsonb_build_object('criteria',q.value->>'rubric','version','assessment-grade-v1'),q.value->'citations' from jsonb_array_elements(p_cards) with ordinality q;
  end if;
  update public.study_sets set status='ready',draft_content=p_content,draft_revision=draft_revision+1,error_code=null,updated_at=now() where id=output.id;
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status='succeeded',output=null,model=p_usage->>'model',provider_request_id=p_usage->>'id',usage=p_usage where id=run_id;
  update public.usage_ledger set status='succeeded',model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id); return true;
end $$;

create function public.save_study_output(p_owner_id uuid,p_study_set_id uuid,p_version_id uuid,p_revision integer,p_content jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; current_version public.study_set_versions; next_version_id uuid;
begin
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if output.type not in ('interactive','mind-map','flowchart','timeline','bar-chart','line-chart') or output.status<>'ready' then return jsonb_build_object('status','unsupported'); end if;
  select * into current_version from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id order by version desc limit 1;
  if current_version.id is distinct from p_version_id or output.draft_revision is distinct from p_revision then return jsonb_build_object('status','conflict'); end if;
  if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>200000 or p_content->>'kind' is distinct from output.type or
    p_content->>'inputKind' is distinct from current_version.content->>'inputKind' or p_content->>'formatVersion' is distinct from '1' or
    coalesce(length(p_content->>'title'),0) not between 1 and 140 or
    jsonb_path_query_array(p_content,'$.**.citations')<>jsonb_path_query_array(current_version.content,'$.**.citations') or
    jsonb_path_query_array(p_content,'$.**.id')<>jsonb_path_query_array(current_version.content,'$.**.id') or
    p_content->'rootId' is distinct from current_version.content->'rootId' or
    jsonb_path_query_array(p_content,'$.edges[*].from')<>jsonb_path_query_array(current_version.content,'$.edges[*].from') or
    jsonb_path_query_array(p_content,'$.edges[*].to')<>jsonb_path_query_array(current_version.content,'$.edges[*].to')
    then raise exception 'invalid_output_edit'; end if;
  insert into public.study_set_versions(study_set_id,owner_id,version,content,settings) values(output.id,p_owner_id,current_version.version+1,p_content,current_version.settings||'{"edited":true}') returning id into next_version_id;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
    select next_version_id,material_id,owner_id,extraction_version from public.study_set_sources where version_id=current_version.id;
  update public.study_sets set title=p_content->>'title',draft_content=p_content,draft_revision=draft_revision+1,updated_at=now() where id=output.id;
  return jsonb_build_object('status','saved');
end $$;
revoke all on function public.save_study_output(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_study_output(uuid,uuid,uuid,integer,jsonb) to service_role;
