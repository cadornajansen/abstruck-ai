alter table public.study_sets drop constraint study_sets_type_check;
alter table public.study_sets add constraint study_sets_type_check check(type in ('notes','summary','flashcards','quiz','exam','podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart'));
alter table public.assets alter column material_id drop not null;
alter table public.assets add column study_set_id uuid;
alter table public.assets add column metadata jsonb not null default '{}';
alter table public.assets add constraint assets_study_set_owner_fkey foreign key(study_set_id,owner_id) references public.study_sets(id,owner_id) on delete cascade;
alter table public.assets add constraint assets_study_role_key unique(study_set_id,role);
alter table public.assets add constraint assets_target_check check((material_id is not null)::integer+(study_set_id is not null)::integer=1);
alter table public.assets drop constraint assets_role_check;
alter table public.assets add constraint assets_role_check check(
  (material_id is not null and role in ('original','normalized_pdf','normalized_audio')) or
  (study_set_id is not null and role in ('study_audio','study_video')));
create index assets_study_set_owner_idx on public.assets(study_set_id,owner_id) where study_set_id is not null;

create or replace function public.queue_study_generation(p_owner_id uuid,p_material_id uuid,p_request_id uuid,
  p_type text,p_settings jsonb,p_source_ids uuid[],p_limit integer default 3)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.study_sets; source public.materials; job_id uuid; queue_message_id bigint; period uuid; sources jsonb;
  billing jsonb; conversation jsonb; input_kind text:='sources'; novel boolean; count_limit integer; media_cost numeric;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  p_source_ids:=coalesce(p_source_ids,'{}');
  if exists(select 1 from public.usage_ledger where id=p_request_id) then
    select s.* into result from public.study_sets s join public.processing_jobs j on j.study_set_id=s.id
      join public.generation_runs r on r.job_id=j.id where r.id=p_request_id and r.owner_id=p_owner_id
      and s.material_id=p_material_id and s.type=p_type and j.input->'settings'=p_settings
      and coalesce((select array_agg((src->>'id')::uuid order by src->>'id') from jsonb_array_elements(j.input->'sources') src),'{}')=
        coalesce((select array_agg(id order by id::text) from unnest(p_source_ids) id),'{}');
    if not found then raise exception 'request_conflict'; end if;
    return jsonb_build_object('studySetId',result.id,'status',result.status,'jobId',(select id from public.processing_jobs where study_set_id=result.id));
  end if;
  novel:=p_type in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart');
  count_limit:=case p_type when 'exam' then 40 when 'quiz' then 20 when 'podcast' then 1 when 'video' then 5 when 'interactive' then 8 when 'mind-map' then 16 when 'flowchart' then 16 when 'timeline' then 12 when 'bar-chart' then 12 when 'line-chart' then 12 else 30 end;
  if p_request_id is null or p_type not in ('summary','flashcards','quiz','exam','podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart') or
    cardinality(p_source_ids)>3 or cardinality(p_source_ids)<>(select count(distinct x) from unnest(p_source_ids) x) or
    jsonb_typeof(p_settings) is distinct from 'object' or coalesce((p_settings->>'count')::integer,0) not between 1 and count_limit or
    coalesce((p_settings->>'pageStart')::integer,0)<1 or coalesce((p_settings->>'pageEnd')::integer,201)>200 or
    (p_settings->>'pageStart')::integer>(p_settings->>'pageEnd')::integer then raise exception 'invalid_generation'; end if;
  if p_type in ('quiz','exam') and (jsonb_typeof(p_settings->'questionTypes') is distinct from 'array' or jsonb_array_length(p_settings->'questionTypes') not between 1 and 5 or
    exists(select 1 from jsonb_array_elements_text(p_settings->'questionTypes') t where t not in ('multiple_choice','multi_select','true_false','fill_blank','free_response')) or
    ((p_settings->>'durationMinutes')::integer is not null and (p_settings->>'durationMinutes')::integer not between 1 and 180)) then raise exception 'invalid_generation'; end if;
  select * into source from public.materials where id=p_material_id and owner_id=p_owner_id and status in ('ready','partial');
  if not found then raise exception 'material_not_ready'; end if;
  if p_settings ? 'conversationId' and not exists(select 1 from public.conversations where id=(p_settings->>'conversationId')::uuid and owner_id=p_owner_id and material_id=source.id) then raise exception 'conversation_missing'; end if;
  if cardinality(p_source_ids)=0 then
    if source.source_type<>'chat' or not(p_settings ? 'conversationId') then raise exception 'invalid_sources'; end if;
    with recent as (
      select id,role,left(content,2000) as text,created_at from public.messages
      where conversation_id=(p_settings->>'conversationId')::uuid and owner_id=p_owner_id and state='complete' and length(btrim(content))>0
      order by created_at desc,role asc limit 12
    ), bounded as (select *,sum(length(text)) over(order by created_at desc,role asc rows unbounded preceding) as characters from recent)
    select jsonb_build_object('id',p_settings->>'conversationId','messages',coalesce(jsonb_agg(jsonb_build_object('id',id,'role',role,'text',text) order by created_at,role desc),'[]'))
      into conversation from bounded where characters<=12000;
    if jsonb_array_length(conversation->'messages')=0 then raise exception 'conversation_empty'; end if;
    sources:='[]'; input_kind:='conversation';
  else
    if source.source_type<>'chat' and not(p_material_id=any(p_source_ids)) then raise exception 'invalid_sources'; end if;
    if exists(select 1 from unnest(p_source_ids) requested(id) where not exists(select 1 from public.materials m
      where m.id=requested.id and m.owner_id=p_owner_id and m.source_type<>'chat' and m.status in ('ready','partial')))
      then raise exception 'source_not_ready'; end if;
    select jsonb_agg(jsonb_build_object('id',m.id,'version',m.extraction_version) order by m.id) into sources from public.materials m where m.id=any(p_source_ids) and m.owner_id=p_owner_id;
    if not exists(select 1 from public.source_segments s join jsonb_to_recordset(sources) src(id uuid,version integer) on src.id=s.material_id and src.version=s.extraction_version
      where s.owner_id=p_owner_id and s.extraction_status<>'unreadable' and length(btrim(s.text))>0 and s.ordinal between (p_settings->>'pageStart')::integer and (p_settings->>'pageEnd')::integer)
      then raise exception 'no_readable_source'; end if;
  end if;
  billing:=public.billing_account_context(p_owner_id); period:=(billing->>'periodId')::uuid;
  if public.billing_active_operations(p_owner_id,true)>=(billing->'limits'->>'concurrentJobs')::integer then raise exception 'job_concurrency_limit'; end if;
  if (select count(*) from public.usage_ledger where period_id=period and feature='study_set' and status<>'failed')>=(billing->'limits'->>'studySets')::integer then raise exception 'study_quota_exceeded'; end if;
  if novel then
    perform pg_advisory_xact_lock(hashtextextended('abstruck_new_study_cost',0));
    select coalesce(sum(l.reserved_cost_usd),0) into media_cost from public.usage_ledger l where l.updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and
      (l.feature='study_tts' or (l.feature='study_set' and exists(select 1 from public.generation_runs r where r.id=l.id and r.operation in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart'))));
    if media_cost+0.004>0.10 then raise exception 'study_daily_cost_limit'; end if;
  end if;
  insert into public.study_sets(owner_id,material_id,space_id,type,title,status) values(p_owner_id,p_material_id,source.space_id,p_type,left(source.title,180)||' · '||initcap(replace(p_type,'-',' ')),'queued') returning * into result;
  insert into public.processing_jobs(owner_id,study_set_id,kind,input) values(p_owner_id,result.id,'generate_'||p_type,
    jsonb_build_object('sources',sources,'settings',p_settings,'inputKind',input_kind)||case when conversation is null then '{}'::jsonb else jsonb_build_object('conversation',conversation) end) returning id into job_id;
  insert into public.generation_runs(id,owner_id,job_id,operation,prompt_version) values(p_request_id,p_owner_id,job_id,p_type,case when novel then 'study-output-v1' else 'study-v2' end);
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,reserved_cost_usd) values(p_request_id,p_owner_id,period,job_id,'study_set','reserved',case when novel then 0.004 else 0 end);
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job_id)) into queue_message_id;
  update public.processing_jobs set message_id=queue_message_id where id=job_id;
  return jsonb_build_object('studySetId',result.id,'jobId',job_id,'status','queued');
end $$;

alter function public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb) rename to finish_study_before_outputs;
create function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; output public.study_sets; version uuid; run_id uuid; citation jsonb; settings jsonb; conversation boolean; novel boolean;
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
  insert into public.study_set_versions(study_set_id,owner_id,version,content,settings) values(output.id,job.owner_id,1,p_content,settings) returning id into version;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version) select version,src.id,job.owner_id,src.version from jsonb_to_recordset(job.input->'sources') src(id uuid,version integer);
  if output.type='flashcards' then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,citations)
      select version,job.owner_id,q.ordinality::integer,'flashcard',jsonb_build_object('front',q.value->>'front','hint',q.value->>'hint'),
        jsonb_build_object('back',q.value->>'back','explanation',q.value->>'explanation'),q.value->'citations' from jsonb_array_elements(p_cards) with ordinality q;
  elsif output.type in ('quiz','exam') then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,rubric,citations)
      select version,job.owner_id,q.ordinality::integer,'question',jsonb_build_object('type',q.value->>'type','text',q.value->>'text','options',q.value->'options'),
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
revoke all on function public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),public.finish_study_before_outputs(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),public.finish_study_before_outputs(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

alter function public.sharing_preview(uuid,uuid,boolean,uuid) rename to sharing_preview_before_outputs;
create function public.sharing_preview(p_owner_id uuid,p_study_set_id uuid,p_include_sources boolean default false,p_version_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type in ('podcast','video','interactive','mind-map','flowchart','timeline','bar-chart','line-chart'))
    then return jsonb_build_object('error','unsupported_output_type'); end if;
  return public.sharing_preview_before_outputs(p_owner_id,p_study_set_id,p_include_sources,p_version_id);
end $$;
revoke all on function public.sharing_preview(uuid,uuid,boolean,uuid),public.sharing_preview_before_outputs(uuid,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.sharing_preview(uuid,uuid,boolean,uuid),public.sharing_preview_before_outputs(uuid,uuid,boolean,uuid) to service_role;
