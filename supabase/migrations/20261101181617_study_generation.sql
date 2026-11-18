alter table public.study_sets add column error_code text;
alter table public.study_sets add constraint notes_markdown_required check (type <> 'notes' or draft_content ? 'markdown');
alter table public.processing_jobs alter column material_id drop not null;
alter table public.processing_jobs add column study_set_id uuid unique;
alter table public.processing_jobs add column input jsonb not null default '{}'::jsonb;
alter table public.processing_jobs add constraint processing_jobs_study_owner_fkey
  foreign key(study_set_id,owner_id) references public.study_sets(id,owner_id) on delete cascade;
alter table public.processing_jobs add constraint processing_jobs_target_check
  check ((material_id is not null)::integer + (study_set_id is not null)::integer = 1);

create table public.generation_runs (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null unique references public.processing_jobs(id) on delete cascade,
  operation text not null,
  model text,
  prompt_version text not null default 'study-v1',
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','uncertain')),
  provider_request_id text,
  usage jsonb,
  error_code text,
  created_at timestamptz not null default now()
);
create index generation_runs_owner_idx on public.generation_runs(owner_id);
alter table public.generation_runs enable row level security;
create policy generation_runs_read_own on public.generation_runs for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.generation_runs from anon,authenticated;
grant select on public.generation_runs to authenticated;
grant all on public.generation_runs to service_role;
select pgmq.create('study_jobs');
grant all on pgmq.q_study_jobs,pgmq.a_study_jobs to service_role;
grant usage,select on sequence pgmq.q_study_jobs_msg_id_seq to service_role;

create function public.queue_study_generation(p_owner_id uuid,p_material_id uuid,p_request_id uuid,
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
      and s.material_id=p_material_id and s.type=p_type and j.input->'settings'=p_settings;
    if not found then raise exception 'request_conflict'; end if;
    return jsonb_build_object('studySetId',result.id,'status',result.status,'jobId',(select id from public.processing_jobs where study_set_id=result.id));
  end if;
  if p_type not in ('summary','flashcards') or cardinality(p_source_ids) not between 1 and 3 or
    not (p_material_id=any(p_source_ids)) then raise exception 'invalid_generation'; end if;
  select * into source from public.materials where id=p_material_id and owner_id=p_owner_id and status in ('ready','partial');
  if not found then raise exception 'material_not_ready'; end if;
  if exists(select 1 from unnest(p_source_ids) requested(id) where not exists
    (select 1 from public.materials m where m.id=requested.id and m.owner_id=p_owner_id and m.status in ('ready','partial')))
    then raise exception 'source_not_ready'; end if;
  select jsonb_agg(jsonb_build_object('id',m.id,'version',m.extraction_version)) into sources from public.materials m where m.id=any(p_source_ids);
  period_start:=profile_created+floor(extract(epoch from(now()-profile_created))/2592000)::integer*interval '30 days';
  insert into public.usage_periods(owner_id,starts_at,ends_at) values(p_owner_id,period_start,period_start+interval '30 days')
    on conflict(owner_id,starts_at) do update set owner_id=excluded.owner_id returning id into period;
  if (select count(*) from public.usage_ledger where period_id=period and feature='study_set' and status<>'failed')>=p_limit
    then raise exception 'study_quota_exceeded'; end if;
  insert into public.study_sets(owner_id,material_id,space_id,type,title,status) values
    (p_owner_id,p_material_id,source.space_id,p_type,left(source.title,200)||case when p_type='summary' then ' · Summary' else ' · Flashcards' end,'queued') returning * into result;
  insert into public.processing_jobs(owner_id,study_set_id,kind,input) values
    (p_owner_id,result.id,'generate_'||p_type,jsonb_build_object('sources',sources,'settings',p_settings)) returning id into job_id;
  insert into public.generation_runs(id,owner_id,job_id,operation) values(p_request_id,p_owner_id,job_id,p_type);
  insert into public.usage_ledger(id,owner_id,period_id,feature,status) values(p_request_id,p_owner_id,period,'study_set','reserved');
  select pgmq.send('study_jobs',jsonb_build_object('job_id',job_id)) into queue_message_id;
  update public.processing_jobs set message_id=queue_message_id where id=job_id;
  return jsonb_build_object('studySetId',result.id,'jobId',job_id,'status','queued');
end $$;

create function public.claim_study_job()
returns table(job_id uuid,lease_token uuid,study_set_id uuid,owner_id uuid,type text,input jsonb,request_id uuid)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; run public.generation_runs;
begin
  for message in select * from pgmq.read('study_jobs',300,1) loop
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') then perform pgmq.delete('study_jobs',message.msg_id); return; end if;
    select * into run from public.generation_runs where generation_runs.job_id=job.id for update;
    if job.attempt>0 then
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
    return query select job.id,token,job.study_set_id,job.owner_id,run.operation,job.input,run.id;
  end loop;
end $$;

create function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; output public.study_sets; version uuid; run_id uuid; citation record; source record;
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
    values(output.id,job.owner_id,1,p_content,job.input->'settings') returning id into version;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
    select version,src.id,job.owner_id,src.version from jsonb_to_recordset(job.input->'sources') as src(id uuid,version integer);
  if output.type='flashcards' then
    insert into public.study_items(version_id,owner_id,position,kind,prompt,answer,citations)
      select version,job.owner_id,card.ordinality::integer,'flashcard',jsonb_build_object('front',card.value->>'front'),
        jsonb_build_object('back',card.value->>'back','explanation',card.value->>'explanation'),card.value->'citations'
      from jsonb_array_elements(p_cards) with ordinality card;
  end if;
  update public.study_sets set status='ready',draft_content=p_content,draft_revision=draft_revision+1,error_code=null,updated_at=now() where id=output.id;
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status='succeeded',model=p_usage->>'model',provider_request_id=p_usage->>'id',usage=p_usage where id=run_id;
  update public.usage_ledger set status='succeeded',model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id);
  return true;
end $$;

create function public.fail_study_job(p_job_id uuid,p_lease_token uuid,p_error text,p_uncertain boolean,p_usage jsonb default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; run_id uuid;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  update public.study_sets set status='failed',error_code=left(p_error,80),updated_at=now() where id=job.study_set_id;
  select id into run_id from public.generation_runs where job_id=job.id;
  update public.generation_runs set status=case when p_uncertain then 'uncertain' else 'failed' end,error_code=left(p_error,80),usage=p_usage where id=run_id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,
    model=p_usage->>'model',provider_response_id=p_usage->>'id',input_tokens=(p_usage->>'input_tokens')::integer,
    output_tokens=(p_usage->>'output_tokens')::integer,cost_usd=(p_usage->>'cost_usd')::numeric,updated_at=now() where id=run_id;
  perform pgmq.delete('study_jobs',job.message_id);
  return true;
end $$;

revoke all on function public.queue_study_generation(uuid,uuid,uuid,text,jsonb,uuid[],integer),public.claim_study_job(),
  public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),public.fail_study_job(uuid,uuid,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.queue_study_generation(uuid,uuid,uuid,text,jsonb,uuid[],integer),public.claim_study_job(),
  public.finish_study_job(uuid,uuid,jsonb,jsonb,jsonb),public.fail_study_job(uuid,uuid,text,boolean,jsonb) to service_role;
