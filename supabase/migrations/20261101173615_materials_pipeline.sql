create extension if not exists pgmq;
select pgmq.create('material_jobs');

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid,
  request_id uuid not null,
  title text not null check (char_length(title) between 1 and 240),
  source_type text not null check (source_type in ('pdf')),
  status text not null default 'awaiting_upload' check (status in
    ('awaiting_upload','queued','extracting','ready','partial','failed')),
  extraction_version integer not null default 1,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id), unique (owner_id, request_id),
  foreign key (space_id, owner_id) references public.spaces(id, owner_id) on delete set null (space_id)
);
create index materials_owner_created_idx on public.materials(owner_id, created_at desc);
create index materials_space_idx on public.materials(space_id, owner_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  owner_id uuid not null,
  role text not null default 'original' check (role = 'original'),
  object_key text not null unique,
  mime text not null,
  bytes bigint not null check (bytes between 1 and 25000000),
  uploaded_at timestamptz,
  unique (material_id, role),
  foreign key (material_id, owner_id) references public.materials(id, owner_id) on delete cascade
);
create index assets_owner_idx on public.assets(owner_id);

create table public.source_segments (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  owner_id uuid not null,
  extraction_version integer not null,
  ordinal integer not null check (ordinal > 0),
  locator jsonb not null,
  text text not null,
  unique (material_id, extraction_version, ordinal),
  foreign key (material_id, owner_id) references public.materials(id, owner_id) on delete cascade
);
create index source_segments_owner_idx on public.source_segments(owner_id);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null unique,
  owner_id uuid not null,
  kind text not null default 'extract_document',
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed')),
  attempt integer not null default 0,
  message_id bigint,
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (material_id, owner_id) references public.materials(id, owner_id) on delete cascade
);
create index processing_jobs_owner_idx on public.processing_jobs(owner_id);

alter table public.materials enable row level security;
alter table public.assets enable row level security;
alter table public.source_segments enable row level security;
alter table public.processing_jobs enable row level security;
create policy materials_read_own on public.materials for select to authenticated using ((select auth.uid()) = owner_id);
create policy assets_read_own on public.assets for select to authenticated using ((select auth.uid()) = owner_id);
create policy segments_read_own on public.source_segments for select to authenticated using ((select auth.uid()) = owner_id);
create policy jobs_read_own on public.processing_jobs for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.materials, public.assets, public.source_segments, public.processing_jobs from anon, authenticated;
grant select on public.materials, public.assets, public.source_segments, public.processing_jobs to authenticated;
grant all on public.materials, public.assets, public.source_segments, public.processing_jobs to service_role;

-- Only the authenticated web server and trusted worker can mutate pipeline state.
-- Locking the owner serializes admission, including concurrent upload requests.
create function public.reserve_material_upload(p_owner_id uuid, p_space_id uuid,
  p_request_id uuid, p_title text, p_bytes bigint, p_storage_limit bigint)
returns public.materials language plpgsql security invoker set search_path = '' as $$
declare result public.materials;
begin
  perform 1 from public.profiles where id = p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into result from public.materials where owner_id = p_owner_id and request_id = p_request_id;
  if found then return result; end if;
  if p_space_id is not null and not exists (select 1 from public.spaces where id = p_space_id and owner_id = p_owner_id)
    then raise exception 'space_not_found'; end if;
  if p_bytes < 1 or p_bytes > 25000000 then raise exception 'file_size_limit'; end if;
  if (select coalesce(sum(bytes), 0) from public.assets where owner_id = p_owner_id) + p_bytes > p_storage_limit
    then raise exception 'storage_quota_exceeded'; end if;
  insert into public.materials(owner_id, space_id, request_id, title, source_type)
    values (p_owner_id,p_space_id,p_request_id,p_title,'pdf') returning * into result;
  insert into public.assets(material_id,owner_id,object_key,mime,bytes)
    values (result.id,p_owner_id,p_owner_id::text || '/' || result.id::text || '/original.pdf','application/pdf',p_bytes);
  return result;
end $$;

create function public.queue_material(p_owner_id uuid, p_material_id uuid, p_retry boolean default false)
returns public.materials language plpgsql security invoker set search_path = '' as $$
declare result public.materials; job_id uuid; msg_id bigint;
begin
  select * into result from public.materials where id = p_material_id and owner_id = p_owner_id for update;
  if not found then raise exception 'material_not_found'; end if;
  if result.status <> 'awaiting_upload' and not (p_retry and result.status = 'failed') then return result; end if;
  update public.assets set uploaded_at = coalesce(uploaded_at,now()) where material_id = result.id;
  insert into public.processing_jobs(material_id,owner_id) values(result.id,p_owner_id)
    on conflict (material_id) do update set state='queued',attempt=0,error_code=null,lease_token=null,lease_until=null,updated_at=now()
    returning id into job_id;
  select pgmq.send('material_jobs',jsonb_build_object('job_id',job_id)) into msg_id;
  update public.processing_jobs set message_id=msg_id where id=job_id;
  update public.materials set status='queued',error_code=null,updated_at=now() where id=result.id returning * into result;
  return result;
end $$;

create function public.claim_material_job(p_visibility_seconds integer default 180)
returns table(job_id uuid,lease_token uuid,material_id uuid,owner_id uuid,object_key text,bytes bigint,source_type text)
language plpgsql security invoker set search_path = '' as $$
declare message record; job public.processing_jobs; token uuid;
begin
  if p_visibility_seconds < 60 or p_visibility_seconds > 600 then raise exception 'invalid_visibility'; end if;
  for message in select * from pgmq.read('material_jobs',p_visibility_seconds,1) loop
    select * into job from public.processing_jobs where id=(message.message->>'job_id')::uuid for update;
    if not found or job.state in ('succeeded','failed') or job.message_id <> message.msg_id then
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    if job.attempt >= 3 then
      update public.processing_jobs set state='failed',error_code='retry_limit',updated_at=now() where id=job.id;
      update public.materials set status='failed',error_code='retry_limit',updated_at=now() where id=job.material_id;
      perform pgmq.delete('material_jobs',message.msg_id); return;
    end if;
    token := gen_random_uuid();
    update public.processing_jobs set state='running',attempt=attempt+1,lease_token=token,
      lease_until=message.vt,updated_at=now() where id=job.id;
    update public.materials set status='extracting',updated_at=now() where id=job.material_id;
    return query select job.id,token,job.material_id,job.owner_id,a.object_key,a.bytes,m.source_type
      from public.assets a join public.materials m on m.id=a.material_id where a.material_id=job.material_id and a.role='original';
  end loop;
end $$;

create function public.finish_material_job(p_job_id uuid,p_lease_token uuid,p_segments jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare job public.processing_jobs; version integer;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state <> 'running' or job.lease_token <> p_lease_token or job.lease_until < now() then return false; end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) not between 1 and 200 then raise exception 'invalid_segments'; end if;
  select extraction_version into version from public.materials where id=job.material_id for update;
  insert into public.source_segments(material_id,owner_id,extraction_version,ordinal,locator,text)
    select job.material_id,job.owner_id,version,s.ordinal,s.locator,s.text
    from jsonb_to_recordset(p_segments) as s(ordinal integer,locator jsonb,text text);
  update public.materials set status=case when exists(select 1 from jsonb_to_recordset(p_segments) as s(text text) where btrim(s.text)='')
    then 'partial' else 'ready' end,error_code=null,updated_at=now() where id=job.material_id;
  update public.processing_jobs set state='succeeded',lease_until=null,updated_at=now() where id=job.id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

create function public.fail_material_job(p_job_id uuid,p_lease_token uuid,p_error text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare job public.processing_jobs;
begin
  select * into job from public.processing_jobs where id=p_job_id for update;
  if not found or job.state <> 'running' or job.lease_token <> p_lease_token or job.lease_until < now() then return false; end if;
  update public.processing_jobs set state='failed',error_code=left(p_error,80),lease_until=null,updated_at=now() where id=job.id;
  update public.materials set status='failed',error_code=left(p_error,80),updated_at=now() where id=job.material_id;
  perform pgmq.delete('material_jobs',job.message_id);
  return true;
end $$;

revoke all on function public.reserve_material_upload(uuid,uuid,uuid,text,bigint,bigint),
  public.queue_material(uuid,uuid,boolean),public.claim_material_job(integer),
  public.finish_material_job(uuid,uuid,jsonb),public.fail_material_job(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_material_upload(uuid,uuid,uuid,text,bigint,bigint),
  public.queue_material(uuid,uuid,boolean),public.claim_material_job(integer),
  public.finish_material_job(uuid,uuid,jsonb),public.fail_material_job(uuid,uuid,text) to service_role;
grant usage on schema pgmq to service_role;
grant execute on all functions in schema pgmq to service_role;
grant all on pgmq.q_material_jobs,pgmq.a_material_jobs to service_role;
grant usage, select on sequence pgmq.q_material_jobs_msg_id_seq to service_role;
