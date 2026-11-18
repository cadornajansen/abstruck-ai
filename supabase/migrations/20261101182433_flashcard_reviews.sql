-- Review answers retain their exact immutable item and version.
alter table public.study_set_versions add unique(id, study_set_id, owner_id);
alter table public.study_items add unique(id, version_id, owner_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  study_set_id uuid not null,
  version_id uuid not null,
  mode text not null check(mode in ('fast','spaced')),
  state text not null default 'active' check(state in ('active','completed')),
  card_ids uuid[] not null,
  request_id uuid not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(id, version_id, owner_id),
  unique(owner_id, request_id),
  foreign key(version_id, study_set_id, owner_id)
    references public.study_set_versions(id, study_set_id, owner_id) on delete cascade
);
create unique index attempts_active_mode_idx on public.attempts(owner_id, study_set_id, mode) where state='active';
create index attempts_version_owner_idx on public.attempts(version_id, study_set_id, owner_id);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  attempt_id uuid not null,
  version_id uuid not null,
  study_item_id uuid not null,
  request_id uuid not null,
  response jsonb not null,
  next_due_at timestamptz,
  created_at timestamptz not null default now(),
  unique(attempt_id, study_item_id),
  unique(owner_id, request_id),
  foreign key(attempt_id, version_id, owner_id) references public.attempts(id, version_id, owner_id) on delete cascade,
  foreign key(study_item_id, version_id, owner_id) references public.study_items(id, version_id, owner_id) on delete cascade
);
create index answers_item_version_owner_idx on public.answers(study_item_id, version_id, owner_id);

create table public.flashcard_review_state (
  owner_id uuid not null,
  study_item_id uuid not null,
  due_at timestamptz,
  interval_minutes integer not null default 0 check(interval_minutes between 0 and 259200),
  repetitions integer not null default 0 check(repetitions >= 0),
  scheduler_version integer not null default 1 check(scheduler_version=1),
  starred boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(owner_id, study_item_id),
  foreign key(study_item_id, owner_id) references public.study_items(id, owner_id) on delete cascade
);
create index flashcard_review_state_item_owner_idx on public.flashcard_review_state(study_item_id, owner_id);

alter table public.attempts enable row level security;
alter table public.answers enable row level security;
alter table public.flashcard_review_state enable row level security;
create policy attempts_read_own on public.attempts for select to authenticated using((select auth.uid())=owner_id);
create policy answers_read_own on public.answers for select to authenticated using((select auth.uid())=owner_id);
create policy flashcard_review_state_read_own on public.flashcard_review_state for select to authenticated using((select auth.uid())=owner_id);
revoke all on public.attempts, public.answers, public.flashcard_review_state from anon, authenticated, service_role;
grant select on public.attempts, public.answers, public.flashcard_review_state to authenticated;
grant select, insert, update, delete on public.attempts, public.flashcard_review_state to service_role;
grant select, insert, delete on public.answers to service_role;

create function public.flashcard_attempt_payload(p_owner_id uuid, p_attempt_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('attemptId',a.id,'versionId',a.version_id,'mode',a.mode,'completed',a.state='completed',
    'reviewedCardIds',(select coalesce(jsonb_agg(r.study_item_id order by r.created_at),'[]') from public.answers r where r.attempt_id=a.id),
    'cards',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'logicalId',i.logical_id,'position',i.position,'kind',i.kind,'prompt',i.prompt,'answer',i.answer,
      'rubric',i.rubric,'citations',i.citations,'review',jsonb_build_object('starred',coalesce(s.starred,false),'due_at',s.due_at)) order by i.position),'[]')
      from public.study_items i left join public.flashcard_review_state s on s.study_item_id=i.id and s.owner_id=i.owner_id
      where i.id=any(a.card_ids) and i.version_id=a.version_id and i.owner_id=a.owner_id and i.kind='flashcard'))
  from public.attempts a where a.id=p_attempt_id and a.owner_id=p_owner_id;
$$;

create function public.start_flashcard_review(p_owner_id uuid,p_study_set_id uuid,p_mode text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; attempt public.attempts; current_version uuid; selected_cards uuid[];
begin
  if p_mode is null or p_mode not in ('fast','spaced') or p_request_id is null then return jsonb_build_object('error','invalid_request'); end if;
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type='flashcards' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into attempt from public.attempts where owner_id=p_owner_id and request_id=p_request_id;
  if found then
    if attempt.study_set_id<>p_study_set_id or attempt.mode<>p_mode then return jsonb_build_object('error','request_conflict'); end if;
    return public.flashcard_attempt_payload(p_owner_id,attempt.id);
  end if;
  select * into attempt from public.attempts where owner_id=p_owner_id and study_set_id=p_study_set_id and mode=p_mode and state='active';
  if found then return public.flashcard_attempt_payload(p_owner_id,attempt.id); end if;
  if output.status<>'ready' then return jsonb_build_object('error','not_ready'); end if;
  select id into current_version from public.study_set_versions where study_set_id=p_study_set_id and owner_id=p_owner_id order by version desc limit 1;
  if not found then return jsonb_build_object('error','not_ready'); end if;
  select coalesce(array_agg(i.id order by i.position),'{}'::uuid[]) into selected_cards
    from public.study_items i left join public.flashcard_review_state s on s.study_item_id=i.id and s.owner_id=i.owner_id
    where i.version_id=current_version and i.owner_id=p_owner_id and i.kind='flashcard'
      and (p_mode='fast' or s.due_at is null or s.due_at<=now());
  insert into public.attempts(owner_id,study_set_id,version_id,mode,card_ids,request_id,state,submitted_at)
    values(p_owner_id,p_study_set_id,current_version,p_mode,selected_cards,p_request_id,
      case when cardinality(selected_cards)=0 then 'completed' else 'active' end,
      case when cardinality(selected_cards)=0 then now() end) returning * into attempt;
  return public.flashcard_attempt_payload(p_owner_id,attempt.id);
end $$;

create function public.rate_flashcard(p_owner_id uuid,p_study_set_id uuid,p_attempt_id uuid,p_card_id uuid,p_rating text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare attempt public.attempts; existing public.answers; card public.study_items; review public.flashcard_review_state;
  due timestamptz; minutes integer; reps integer; payload jsonb;
begin
  if p_rating is null or p_rating not in ('again','got_it') or p_request_id is null then return jsonb_build_object('error','invalid_request'); end if;
  -- The same lock order as edits keeps schedule copies and ratings consistent.
  perform 1 from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type='flashcards' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into attempt from public.attempts where id=p_attempt_id and owner_id=p_owner_id and study_set_id=p_study_set_id for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into existing from public.answers where owner_id=p_owner_id and request_id=p_request_id;
  if found and (existing.attempt_id<>attempt.id or existing.study_item_id<>p_card_id or existing.response->>'rating'<>p_rating)
    then return jsonb_build_object('error','request_conflict'); end if;
  select * into existing from public.answers where attempt_id=attempt.id and study_item_id=p_card_id;
  if found then
    if existing.response->>'rating'<>p_rating then return jsonb_build_object('error','request_conflict'); end if;
    payload:=public.flashcard_attempt_payload(p_owner_id,attempt.id);
    return (payload-'cards') || jsonb_build_object('nextDueAt',existing.next_due_at);
  end if;
  if attempt.state<>'active' or not (p_card_id=any(attempt.card_ids)) then return jsonb_build_object('error','invalid_card'); end if;
  select * into card from public.study_items where id=p_card_id and owner_id=p_owner_id and version_id=attempt.version_id and kind='flashcard';
  if not found then return jsonb_build_object('error','invalid_card'); end if;
  if attempt.mode='spaced' then
    insert into public.flashcard_review_state(owner_id,study_item_id) values(p_owner_id,p_card_id) on conflict do nothing;
    select * into review from public.flashcard_review_state where owner_id=p_owner_id and study_item_id=p_card_id for update;
    reps:=case when p_rating='again' then 0 else review.repetitions+1 end;
    minutes:=case when p_rating='again' then 10 when reps=1 then 1440 when reps=2 then 4320 when reps=3 then 10080
      when reps=4 then 20160 when reps=5 then 43200 else least(review.interval_minutes*2,259200) end;
    due:=now()+make_interval(mins=>minutes);
    -- A frozen attempt can update unchanged descendants, never a card whose text was edited.
    insert into public.flashcard_review_state(owner_id,study_item_id,due_at,interval_minutes,repetitions)
      select p_owner_id,i.id,due,minutes,reps from public.study_items i join public.study_set_versions v on v.id=i.version_id
      where i.owner_id=p_owner_id and i.logical_id=card.logical_id and v.study_set_id=p_study_set_id
        and v.version >= (select version from public.study_set_versions where id=attempt.version_id)
        and not exists(select 1 from public.study_items changed join public.study_set_versions cv on cv.id=changed.version_id
          where cv.study_set_id=p_study_set_id and changed.logical_id=card.logical_id
            and cv.version between (select version from public.study_set_versions where id=attempt.version_id) and v.version
            and (changed.prompt<>card.prompt or changed.answer<>card.answer))
      on conflict(owner_id,study_item_id) do update set due_at=excluded.due_at,interval_minutes=excluded.interval_minutes,
        repetitions=excluded.repetitions,updated_at=now();
  end if;
  insert into public.answers(owner_id,attempt_id,version_id,study_item_id,request_id,response,next_due_at)
    values(p_owner_id,attempt.id,attempt.version_id,p_card_id,p_request_id,jsonb_build_object('rating',p_rating),due);
  if (select count(*) from public.answers where attempt_id=attempt.id)=cardinality(attempt.card_ids) then
    update public.attempts set state='completed',submitted_at=now() where id=attempt.id;
  end if;
  payload:=public.flashcard_attempt_payload(p_owner_id,attempt.id);
  return (payload-'cards') || jsonb_build_object('nextDueAt',due);
end $$;

create function public.star_flashcard(p_owner_id uuid,p_study_set_id uuid,p_card_id uuid,p_starred boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare card public.study_items;
begin
  if p_starred is null then return jsonb_build_object('error','invalid_request'); end if;
  perform 1 from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type='flashcards' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select i.* into card from public.study_items i join public.study_set_versions v on v.id=i.version_id
    where i.id=p_card_id and i.owner_id=p_owner_id and v.study_set_id=p_study_set_id and i.kind='flashcard';
  if not found then return jsonb_build_object('error','invalid_card'); end if;
  insert into public.flashcard_review_state(owner_id,study_item_id,starred)
    select p_owner_id,i.id,p_starred from public.study_items i join public.study_set_versions v on v.id=i.version_id
    where i.owner_id=p_owner_id and i.logical_id=card.logical_id and v.study_set_id=p_study_set_id
    on conflict(owner_id,study_item_id) do update set starred=excluded.starred,updated_at=now();
  return jsonb_build_object('cardId',p_card_id,'starred',p_starred);
end $$;

create function public.edit_flashcard(p_owner_id uuid,p_study_set_id uuid,p_card_id uuid,p_front text,p_back text,p_explanation text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare output public.study_sets; previous public.study_set_versions; card public.study_items; next_version uuid;
begin
  if p_front is null or length(btrim(p_front)) not between 1 and 2000 or p_back is null or length(btrim(p_back)) not between 1 and 5000
    or length(coalesce(p_explanation,''))>5000 or p_revision is null or p_revision<0 then return jsonb_build_object('error','invalid_request'); end if;
  select * into output from public.study_sets where id=p_study_set_id and owner_id=p_owner_id and type='flashcards' for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  if output.draft_revision<>p_revision then return jsonb_build_object('error','revision_conflict'); end if;
  if output.status<>'ready' then return jsonb_build_object('error','not_ready'); end if;
  select * into previous from public.study_set_versions where study_set_id=output.id and owner_id=p_owner_id order by version desc limit 1;
  select * into card from public.study_items where id=p_card_id and owner_id=p_owner_id and version_id=previous.id and kind='flashcard';
  if not found then return jsonb_build_object('error','invalid_card'); end if;
  if card.prompt->>'front'=btrim(p_front) and card.answer->>'back'=btrim(p_back)
    and coalesce(card.answer->>'explanation','')=coalesce(p_explanation,'') then return jsonb_build_object('saved',true); end if;
  insert into public.study_set_versions(study_set_id,owner_id,version,content,settings)
    values(output.id,p_owner_id,previous.version+1,previous.content,previous.settings) returning id into next_version;
  insert into public.study_set_sources(version_id,material_id,owner_id,extraction_version)
    select next_version,material_id,owner_id,extraction_version from public.study_set_sources where version_id=previous.id;
  insert into public.study_items(logical_id,version_id,owner_id,position,kind,prompt,answer,rubric,citations)
    select logical_id,next_version,owner_id,position,kind,
      case when id=p_card_id then prompt || jsonb_build_object('front',btrim(p_front)) else prompt end,
      case when id=p_card_id then answer || jsonb_build_object('back',btrim(p_back),'explanation',coalesce(p_explanation,'')) else answer end,rubric,citations
    from public.study_items where version_id=previous.id and owner_id=p_owner_id;
  insert into public.flashcard_review_state(owner_id,study_item_id,due_at,interval_minutes,repetitions,starred)
    select p_owner_id,new.id,case when old.id<>p_card_id then s.due_at end,
      case when old.id=p_card_id then 0 else s.interval_minutes end,
      case when old.id=p_card_id then 0 else s.repetitions end,s.starred
    from public.study_items old join public.flashcard_review_state s on s.study_item_id=old.id and s.owner_id=old.owner_id
    join public.study_items new on new.logical_id=old.logical_id and new.version_id=next_version
    where old.version_id=previous.id and old.owner_id=p_owner_id;
  update public.study_sets set draft_revision=draft_revision+1,updated_at=now() where id=output.id;
  return jsonb_build_object('saved',true);
end $$;

revoke all on function public.flashcard_attempt_payload(uuid,uuid),public.start_flashcard_review(uuid,uuid,text,uuid),
  public.rate_flashcard(uuid,uuid,uuid,uuid,text,uuid),public.star_flashcard(uuid,uuid,uuid,boolean),
  public.edit_flashcard(uuid,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.flashcard_attempt_payload(uuid,uuid),public.start_flashcard_review(uuid,uuid,text,uuid),
  public.rate_flashcard(uuid,uuid,uuid,uuid,text,uuid),public.star_flashcard(uuid,uuid,uuid,boolean),
  public.edit_flashcard(uuid,uuid,uuid,text,text,text,integer) to service_role;
create or replace function public.finish_study_job(p_job_id uuid,p_lease_token uuid,p_content jsonb,p_cards jsonb,p_usage jsonb)
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
      select version,job.owner_id,card.ordinality::integer,'flashcard',jsonb_build_object('front',card.value->>'front','hint',card.value->>'hint'),
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
