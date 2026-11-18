create extension if not exists vector with schema extensions;

alter table public.source_segments
  add column embedding extensions.vector(512),
  add column embedding_model text,
  add column embedding_version integer not null default 0,
  add column embedding_hash text,
  add column embedding_state text not null default 'pending' check(embedding_state in ('pending','ready','fts_only','excluded')),
  add column search_text tsvector generated always as (to_tsvector('english'::regconfig,text)) stored;
create index source_segments_search_idx on public.source_segments using gin(search_text) where extraction_status<>'unreadable';
create index source_segments_current_idx on public.source_segments(owner_id,material_id,extraction_version);

update public.source_segments set embedding_state=case when extraction_status='unreadable' or btrim(text)='' then 'excluded'
  when octet_length(text)>8000 then 'fts_only' else 'pending' end;

create function public.invalidate_source_embedding()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' or new.text is distinct from old.text or new.extraction_status is distinct from old.extraction_status then
    new.embedding:=null; new.embedding_model:=null; new.embedding_version:=0; new.embedding_hash:=null;
    new.embedding_state:=case when new.extraction_status='unreadable' or btrim(new.text)='' then 'excluded'
      when octet_length(new.text)>8000 then 'fts_only' else 'pending' end;
  end if;
  return new;
end $$;
create trigger invalidate_source_embedding before insert or update of text,extraction_status on public.source_segments
  for each row execute function public.invalidate_source_embedding();

create function public.queue_source_index(p_owner_id uuid,p_material_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; source public.materials; message bigint;
begin
  select * into job from public.processing_jobs where material_id=p_material_id and owner_id=p_owner_id for update;
  if not found or job.state<>'succeeded' then return false; end if;
  select * into source from public.materials where id=p_material_id and owner_id=p_owner_id;
  if source.status not in ('ready','partial') or not exists(select 1 from public.source_segments s
    where s.material_id=source.id and s.owner_id=p_owner_id and s.extraction_version=source.extraction_version
      and s.embedding_state='pending') then return false; end if;
  if job.kind='index_material' and (job.input->'source_index'->>'extraction_version')::integer=source.extraction_version
    then return false; end if;
  select pgmq.send('material_jobs',jsonb_build_object('job_id',job.id)) into message;
  update public.processing_jobs set kind='index_material',state='queued',attempt=0,message_id=message,lease_token=null,lease_until=null,
    input=input||jsonb_build_object('source_index',jsonb_build_object('state','queued','extraction_version',source.extraction_version,
      'model','text-embedding-3-small','dimensions',512,'version',1)),updated_at=now()
    where id=job.id;
  return true;
end $$;

create function public.queue_source_index_after_extraction()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.state='succeeded' and old.state is distinct from 'succeeded' and new.kind='extract_document' and new.material_id is not null then
    perform public.queue_source_index(new.owner_id,new.material_id);
  end if;
  return null;
end $$;
-- Completion routines acknowledge their captured original message after this
-- trigger queues a distinct index message, in the same database transaction.
create trigger queue_source_index_after_extraction after update of state on public.processing_jobs
  for each row execute function public.queue_source_index_after_extraction();

create or replace function public.billing_active_operations(p_owner_id uuid,p_include_queued boolean default true)
returns integer language sql stable security invoker set search_path='' as $$
  select ((select count(*) from public.processing_jobs where owner_id=p_owner_id and
    ((state='queued' and p_include_queued and kind<>'index_material') or (state='running' and lease_until>now()) or state='waiting_provider'))+
    (select count(*) from public.usage_ledger where owner_id=p_owner_id and feature='chat' and status='reserved'
      and updated_at>now()-interval '3 minutes'))::integer;
$$;

alter function public.claim_material_job(integer) rename to claim_material_before_index;
create function public.claim_material_job(p_visibility_seconds integer default 600,p_include_index boolean default false,p_index_material_ids uuid[] default null)
returns table(job_id uuid,lease_token uuid,material_id uuid,owner_id uuid,object_key text,bytes bigint,source_type text,source_sha256 text,input jsonb)
language plpgsql security invoker set search_path='' as $$
declare message record; job public.processing_jobs; token uuid; owner uuid; account jsonb; cached_publication boolean; media_submitted boolean;
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
    if job.kind='index_material' then
      if not p_include_index or (p_index_material_ids is not null and not(job.material_id=any(p_index_material_ids))) then
        perform pgmq.set_vt('material_jobs',message.msg_id,15); return;
      end if;
      if job.input->'source_index'->'batch'->>'state'='submitted' then
        update public.processing_jobs set state='failed',lease_until=null,error_code='embedding_result_unconfirmed',
          input=jsonb_set(input,'{source_index,state}','"uncertain"'::jsonb),updated_at=now() where id=job.id;
        update public.usage_ledger set status='uncertain',updated_at=now() where processing_job_id=job.id and feature='material_embeddings';
        perform pgmq.delete('material_jobs',message.msg_id); return;
      end if;
      if not exists(select 1 from public.materials m where m.id=job.material_id and m.owner_id=owner and m.status in ('ready','partial')
        and m.extraction_version=(job.input->'source_index'->>'extraction_version')::integer) then
        update public.processing_jobs set state='failed',lease_until=null,error_code='stale_index',updated_at=now() where id=job.id;
        perform pgmq.delete('material_jobs',message.msg_id); return;
      end if;
      if public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
        perform pgmq.set_vt('material_jobs',message.msg_id,15); return;
      end if;
      token:=gen_random_uuid();
      job.input:=job.input||jsonb_build_object('lease_started_at',now());
      update public.processing_jobs set state='running',lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
      return query select job.id,token,job.material_id,owner,''::text,0::bigint,'index_material'::text,null::text,job.input;
      return;
    end if;
    media_submitted:=exists(select 1 from public.transcription_runs r where r.job_id=job.id and r.submitted_at is not null);
    if job.attempt>=3 and not media_submitted then
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
    if not cached_publication and not media_submitted and public.billing_active_operations(owner,false)>=(account->'limits'->>'concurrentJobs')::integer then
      perform pgmq.set_vt('material_jobs',message.msg_id,15); return;
    end if;
    token:=gen_random_uuid();
    job.input:=job.input||jsonb_build_object('lease_started_at',now());
    update public.processing_jobs set state='running',attempt=attempt+case when media_submitted then 0 else 1 end,lease_token=token,lease_until=message.vt,input=job.input,updated_at=now() where id=job.id;
    update public.materials set status=case when media_submitted then 'transcribing' else 'extracting' end,updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,coalesce(a.object_key,''),coalesce(a.bytes,0::bigint),m.source_type,a.source_sha256,job.input
      from public.materials m left join public.assets a on a.material_id=m.id and a.role='original'
      where m.id=job.material_id and (m.source_type='youtube' or a.id is not null);
  end loop;
end $$;

create function public.begin_source_index_batch(p_job_id uuid,p_lease_token uuid,p_max_cost_usd numeric default 0.05)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid; account jsonb; job public.processing_jobs; segments jsonb; input_bytes integer; cost numeric; ledger public.usage_ledger;
  batch_id uuid:=gen_random_uuid(); version integer; feature_name text;
begin
  select owner_id into owner from public.processing_jobs where id=p_job_id;
  account:=public.billing_account_context(owner);
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.kind<>'index_material' or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return null; end if;
  version:=(job.input->'source_index'->>'extraction_version')::integer;
  if not exists(select 1 from public.materials where id=job.material_id and owner_id=owner and extraction_version=version and status in ('ready','partial'))
    then raise exception 'stale_index'; end if;
  if job.input->'source_index'->'batch'->>'state'='submitted' then raise exception 'embedding_result_unconfirmed'; end if;
  select jsonb_agg(jsonb_build_object('id',s.id,'text',s.text,'hash',md5(s.text)) order by s.ordinal),sum(octet_length(s.text))::integer
    into segments,input_bytes from (select id,text,ordinal from public.source_segments where material_id=job.material_id and owner_id=owner
      and extraction_version=version and embedding_state='pending' and extraction_status<>'unreadable'
      and btrim(text)<>'' and octet_length(text)<=8000 order by ordinal limit 16) s;
  feature_name:='material_embeddings:'||version::text;
  if segments is null then
    update public.processing_jobs set state='succeeded',lease_until=null,error_code=null,
      input=jsonb_set(input,'{source_index,state}','"complete"'::jsonb),updated_at=now() where id=job.id;
    update public.usage_ledger set status='succeeded',updated_at=now() where processing_job_id=job.id and feature=feature_name and status='reserved';
    perform pgmq.delete('material_jobs',job.message_id);
    return jsonb_build_object('done',true);
  end if;
  cost:=input_bytes*0.00000002;
  if p_max_cost_usd is null or p_max_cost_usd<=0 or p_max_cost_usd>0.05 or cost>p_max_cost_usd then raise exception 'embedding_batch_cost_limit'; end if;
  select * into ledger from public.usage_ledger where processing_job_id=job.id and feature=feature_name for update;
  if coalesce(ledger.reserved_cost_usd,0)+cost>0.05 then raise exception 'embedding_material_cost_limit'; end if;
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where owner_id=owner and period_id=(account->>'periodId')::uuid
    and feature like 'material_embeddings:%')+cost>0.25 then raise exception 'embedding_owner_cost_limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended('abstruck_embedding_daily_cost',0));
  if (select coalesce(sum(reserved_cost_usd),0) from public.usage_ledger where feature like 'material_embeddings:%'
    and updated_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+cost>1 then raise exception 'embedding_daily_cost_limit'; end if;
  insert into public.usage_ledger(id,owner_id,period_id,processing_job_id,feature,status,units,reserved_cost_usd,model)
    values(gen_random_uuid(),owner,(account->>'periodId')::uuid,job.id,feature_name,'reserved',0,cost,'text-embedding-3-small')
    on conflict(processing_job_id,feature) where processing_job_id is not null do update
      set reserved_cost_usd=usage_ledger.reserved_cost_usd+cost,status='reserved',updated_at=now();
  update public.processing_jobs set input=jsonb_set(input,'{source_index,batch}',jsonb_build_object('id',batch_id,'state','submitted',
    'segments',(select jsonb_agg(value-'text') from jsonb_array_elements(segments)),'input_bytes',input_bytes,'reserved_usd',cost)),updated_at=now() where id=job.id;
  return jsonb_build_object('done',false,'batchId',batch_id,'segments',segments,'reservedUsd',cost,'inputBytes',input_bytes);
end $$;

create function public.checkpoint_source_index_batch(p_job_id uuid,p_lease_token uuid,p_batch_id uuid,p_vectors jsonb,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; batch jsonb; item record; version integer; feature_name text; stale boolean; receipt jsonb;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.kind<>'index_material' or job.state<>'running' or job.lease_token<>p_lease_token or job.lease_until<now() then return false; end if;
  batch:=job.input->'source_index'->'batch'; version:=(job.input->'source_index'->>'extraction_version')::integer;
  feature_name:='material_embeddings:'||version::text;
  if batch->>'id' is distinct from p_batch_id::text then raise exception 'embedding_batch_conflict'; end if;
  if batch->>'state'='saved' then return true; end if;
  if (jsonb_typeof(p_vectors)='array' and jsonb_array_length(p_vectors)=jsonb_array_length(batch->'segments') and
    jsonb_typeof(p_usage)='object' and p_usage->>'model'='text-embedding-3-small' and
    (p_usage->>'input_tokens')::integer between 1 and (batch->>'input_bytes')::integer and
    (p_usage->>'cost_usd')::numeric=(p_usage->>'input_tokens')::integer*0.00000002) is not true then raise exception 'invalid_embedding_receipt'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_vectors))<>jsonb_array_length(p_vectors) then raise exception 'invalid_embedding_ids'; end if;
  for item in select value from jsonb_array_elements(p_vectors) loop
    if jsonb_typeof(item.value->'embedding') is distinct from 'array' or jsonb_array_length(item.value->'embedding')<>512 or not exists
      (select 1 from jsonb_array_elements(batch->'segments') s where s->>'id'=item.value->>'id') then raise exception 'invalid_embedding_vector'; end if;
  end loop;
  stale:=not exists(select 1 from public.materials where id=job.material_id and owner_id=job.owner_id and extraction_version=version and status in ('ready','partial'));
  receipt:=p_usage||jsonb_build_object('batchId',p_batch_id,'extractionVersion',version,'segments',jsonb_array_length(p_vectors));
  update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object(p_batch_id::text,receipt),
    input_tokens=coalesce(input_tokens,0)+(p_usage->>'input_tokens')::integer,output_tokens=0,
    cost_usd=coalesce(cost_usd,0)+(p_usage->>'cost_usd')::numeric,units=units+jsonb_array_length(p_vectors),
    provider_response_id=p_usage->>'id',updated_at=now() where processing_job_id=job.id and feature=feature_name;
  if stale then
    update public.processing_jobs set state='failed',lease_until=null,error_code='stale_index',updated_at=now() where id=job.id;
    update public.usage_ledger set status='succeeded' where processing_job_id=job.id and feature=feature_name;
    perform pgmq.delete('material_jobs',job.message_id); return false;
  end if;
  for item in select value from jsonb_array_elements(p_vectors) loop
    update public.source_segments set embedding=(item.value->'embedding')::text::extensions.vector(512),embedding_model='text-embedding-3-small',
      embedding_version=1,embedding_hash=md5(text),embedding_state='ready'
      where id=(item.value->>'id')::uuid and owner_id=job.owner_id and material_id=job.material_id and extraction_version=version
        and extraction_status<>'unreadable' and exists(select 1 from jsonb_array_elements(batch->'segments') s
          where s->>'id'=item.value->>'id' and s->>'hash'=md5(public.source_segments.text));
    if not found then raise exception 'source_changed_during_index'; end if;
  end loop;
  update public.processing_jobs set input=jsonb_set(input,'{source_index,batch,state}','"saved"'::jsonb),updated_at=now() where id=job.id;
  return true;
end $$;


create function public.fail_source_index(p_job_id uuid,p_lease_token uuid,p_reason text,p_uncertain boolean,p_usage jsonb default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.processing_jobs; batch jsonb; feature_name text;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.kind<>'index_material' or job.state<>'running' or job.lease_token<>p_lease_token then return false; end if;
  batch:=job.input->'source_index'->'batch';
  feature_name:='material_embeddings:'||(job.input->'source_index'->>'extraction_version');
  if p_usage is not null and (p_usage->>'model'='text-embedding-3-small' and
      (p_usage->>'input_tokens')::integer between 1 and (batch->>'input_bytes')::integer and
      (p_usage->>'cost_usd')::numeric=(p_usage->>'input_tokens')::integer*0.00000002) is true then
    update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object(batch->>'id',p_usage||jsonb_build_object('state','failed')),
      input_tokens=coalesce(input_tokens,0)+(p_usage->>'input_tokens')::integer,output_tokens=0,
      cost_usd=coalesce(cost_usd,0)+(p_usage->>'cost_usd')::numeric,provider_response_id=p_usage->>'id',updated_at=now()
      where processing_job_id=job.id and feature=feature_name and not(provider_usage ? (batch->>'id'));
  end if;
  update public.processing_jobs set state='failed',lease_until=null,error_code=left(p_reason,80),
    input=jsonb_set(input,'{source_index,state}',to_jsonb(case when p_uncertain then 'uncertain'::text else 'failed'::text end)),updated_at=now() where id=job.id;
  update public.usage_ledger set status=case when p_uncertain then 'uncertain' else 'failed' end,updated_at=now()
    where processing_job_id=job.id and feature=feature_name and status='reserved';
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

create function public.hybrid_source_search(p_material_ids uuid[],p_query text,p_embedding extensions.vector default null,p_request_id uuid default null)
returns table(id uuid,material_id uuid,title text,page integer,locator jsonb,text text,semantic_ready boolean,score double precision)
language sql stable security invoker set search_path='' as $$
with allowed as (
  select cardinality(p_material_ids) between 1 and 3 and length(p_query) between 1 and 2000 and
    cardinality(p_material_ids)=(select count(distinct x) from unnest(p_material_ids) x) and
    cardinality(p_material_ids)=(select count(*) from public.materials m where m.id=any(p_material_ids)
      and m.owner_id=(select auth.uid()) and m.status in ('ready','partial') and m.source_type<>'chat') as valid
), eligible as (
  select s.*,m.title from public.source_segments s join public.materials m on m.id=s.material_id and m.owner_id=s.owner_id
    cross join allowed a where a.valid and s.owner_id=(select auth.uid()) and s.material_id=any(p_material_ids)
    and s.extraction_version=m.extraction_version and m.status in ('ready','partial') and s.extraction_status<>'unreadable' and btrim(s.text)<>''
    and (p_request_id is null or exists(select 1 from public.messages msg where msg.request_id=p_request_id and msg.owner_id=(select auth.uid())
      and msg.role='user' and msg.state='pending' and msg.source_versions->>s.material_id::text=s.extraction_version::text))
), available as (
  select coalesce(bool_or(embedding_state='ready' and embedding_model='text-embedding-3-small' and embedding_version=1 and embedding_hash=md5(text)),false)
    and not coalesce(bool_or(embedding_state='pending' or (embedding_state='ready' and (embedding_model is distinct from 'text-embedding-3-small' or embedding_version<>1 or embedding_hash is distinct from md5(text)))),false) as ready from eligible
), query as (select websearch_to_tsquery('english',p_query) as terms),
lexical as (
  select e.id,row_number() over(order by ts_rank_cd(e.search_text,q.terms) desc,e.id) as rank
    from eligible e cross join query q where e.search_text@@q.terms
    order by ts_rank_cd(e.search_text,q.terms) desc,e.id limit 16
), semantic as (
  select e.id,row_number() over(order by e.embedding operator(extensions.<=>) p_embedding,e.id) as rank,
    1-(e.embedding operator(extensions.<=>) p_embedding) as similarity
    from eligible e cross join available a where a.ready and p_embedding is not null and extensions.vector_dims(p_embedding)=512
      and e.embedding_state='ready' and e.embedding_model='text-embedding-3-small' and e.embedding_version=1
      and e.embedding_hash=md5(e.text)
    order by e.embedding operator(extensions.<=>) p_embedding,e.id limit 16
), ranked as (
  select coalesce(l.id,v.id) as id,coalesce(1.0/(50+l.rank),0)+coalesce(1.0/(50+v.rank),0) as score,coalesce(v.similarity,-1) as similarity
    from lexical l full join semantic v on v.id=l.id
), chosen as (
  select e.*,coalesce(r.score,0)::double precision as score,coalesce(r.similarity,-1) as similarity
    from eligible e left join ranked r on r.id=e.id order by score desc,similarity desc,e.ordinal,e.id limit 8
)
select e.id,e.material_id,e.title,e.ordinal,e.locator,
  case when octet_length(e.text)<=8000 then e.text else substr(e.text,greatest(1,coalesce(
    (select min(nullif(strpos(lower(e.text),term),0)) from unnest(tsvector_to_array(to_tsvector('english',p_query))) term),1)-600),3000) end,
  a.ready,e.score from chosen e cross join available a order by e.score desc,e.similarity desc,e.ordinal,e.id;
$$;

create function public.begin_chat_retrieval(p_owner_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ledger public.usage_ledger; question public.messages; bound integer;
begin
  select * into ledger from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  select * into question from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='user' and state='pending';
  if ledger.id is null or question.id is null or ledger.status<>'reserved' or question.preferences->>'webSearch'='true' then return null; end if;
  if ledger.provider_usage ? 'retrieval' then return jsonb_build_object('admitted',false); end if;
  bound:=octet_length(question.content);
  if bound not between 1 and 8000 then raise exception 'query_embedding_input_limit'; end if;
  update public.usage_ledger set reserved_cost_usd=reserved_cost_usd+bound*0.00000002,
    provider_usage=provider_usage||jsonb_build_object('retrieval',jsonb_build_object('state','submitted','input_bytes',bound,
      'model','text-embedding-3-small','dimensions',512,'question_hash',md5(question.content))),updated_at=now() where id=p_request_id;
  return jsonb_build_object('admitted',true,'question',question.content,'inputBytes',bound);
end $$;

create function public.checkpoint_chat_retrieval(p_owner_id uuid,p_request_id uuid,p_usage jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; receipt jsonb;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  receipt:=entry.provider_usage->'retrieval';
  if receipt is null then raise exception 'retrieval_missing'; end if;
  if receipt->>'state'='saved' then return true; end if;
  if (jsonb_typeof(p_usage)='object' and p_usage->>'model'='text-embedding-3-small' and
    (p_usage->>'input_tokens')::integer between 1 and (receipt->>'input_bytes')::integer and
    (p_usage->>'cost_usd')::numeric=(p_usage->>'input_tokens')::integer*0.00000002) is not true then raise exception 'invalid_retrieval_receipt'; end if;
  update public.usage_ledger set provider_usage=jsonb_set(provider_usage,'{retrieval}',receipt||p_usage||jsonb_build_object('state','saved')),updated_at=now()
    where id=p_request_id;
  return entry.status='reserved' and exists(select 1 from public.messages where request_id=p_request_id and owner_id=p_owner_id and role='user' and state='pending');
end $$;

create or replace function public.settle_chat_request(p_owner_id uuid,p_request_id uuid,p_state text,p_text text,p_citations jsonb,p_usage jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare entry public.usage_ledger; question public.messages; search_usage jsonb; answer_usage jsonb; combined jsonb;
  sources jsonb; final_state text; retrieval_usage jsonb;
begin
  select * into entry from public.usage_ledger where id=p_request_id and owner_id=p_owner_id and feature='chat' for update;
  select * into question from public.messages where owner_id=p_owner_id and request_id=p_request_id and role='user' for update;
  if entry.id is null or question.id is null then raise exception 'request_missing'; end if;
  if question.state='complete' then return 'complete'; end if;
  sources:=coalesce(p_usage->'web_sources','[]'::jsonb);
  if jsonb_typeof(sources)<>'array' or jsonb_array_length(sources)>5 or
    exists(select 1 from jsonb_array_elements(sources) s where not
      coalesce(entry.provider_usage->'search_evidence'->'sources','[]'::jsonb) @> jsonb_build_array(s)) or
    (jsonb_array_length(sources)>0 and question.preferences->>'webSearch'<>'true') then raise exception 'invalid_web_citation'; end if;
  search_usage:=coalesce(entry.provider_usage->'search',p_usage->'search','{}'::jsonb);
  retrieval_usage:=coalesce(entry.provider_usage->'retrieval','{}'::jsonb);
  answer_usage:=p_usage-'search'-'web_sources';
  combined:=jsonb_build_object(
    'id',coalesce(answer_usage->>'id',search_usage->>'id'),
    'model',coalesce(answer_usage->>'model',question.preferences->>'actualModel'),
    'input_tokens',case when answer_usage->>'input_tokens' is null and search_usage->>'input_tokens' is null and retrieval_usage->>'input_tokens' is null then null else
      coalesce((answer_usage->>'input_tokens')::integer,0)+coalesce((search_usage->>'input_tokens')::integer,0)+coalesce((retrieval_usage->>'input_tokens')::integer,0) end,
    'output_tokens',case when answer_usage->>'output_tokens' is null and search_usage->>'output_tokens' is null and retrieval_usage->>'output_tokens' is null then null else
      coalesce((answer_usage->>'output_tokens')::integer,0)+coalesce((search_usage->>'output_tokens')::integer,0)+coalesce((retrieval_usage->>'output_tokens')::integer,0) end,
    'cost_usd',case when answer_usage->>'cost_usd' is null and search_usage->>'cost_usd' is null and retrieval_usage->>'cost_usd' is null then null else
      coalesce((answer_usage->>'cost_usd')::numeric,0)+coalesce((search_usage->>'cost_usd')::numeric,0)+coalesce((retrieval_usage->>'cost_usd')::numeric,0) end);
  final_state:=public.settle_chat_before_web(p_owner_id,p_request_id,p_state,p_text,p_citations,combined);
  update public.messages set content=left(p_text,14000),web_sources=case when final_state='complete' then sources else '[]'::jsonb end
    where owner_id=p_owner_id and request_id=p_request_id and role='assistant';
  update public.usage_ledger set provider_usage=provider_usage||jsonb_build_object('search',search_usage,'answer',answer_usage)
    where id=p_request_id;
  return final_state;
end $$;

revoke all on function public.invalidate_source_embedding(),public.queue_source_index(uuid,uuid),public.queue_source_index_after_extraction(),
  public.claim_material_job(integer,boolean,uuid[]),public.claim_material_before_index(integer),
  public.begin_source_index_batch(uuid,uuid,numeric),public.checkpoint_source_index_batch(uuid,uuid,uuid,jsonb,jsonb),
  public.fail_source_index(uuid,uuid,text,boolean,jsonb),public.begin_chat_retrieval(uuid,uuid),public.checkpoint_chat_retrieval(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.invalidate_source_embedding(),public.queue_source_index(uuid,uuid),public.queue_source_index_after_extraction(),
  public.claim_material_job(integer,boolean,uuid[]),public.claim_material_before_index(integer),
  public.begin_source_index_batch(uuid,uuid,numeric),public.checkpoint_source_index_batch(uuid,uuid,uuid,jsonb,jsonb),
  public.fail_source_index(uuid,uuid,text,boolean,jsonb),public.begin_chat_retrieval(uuid,uuid),public.checkpoint_chat_retrieval(uuid,uuid,jsonb)
  to service_role;
revoke all on function public.hybrid_source_search(uuid[],text,extensions.vector,uuid) from public,anon;
grant execute on function public.hybrid_source_search(uuid[],text,extensions.vector,uuid) to authenticated,service_role;



