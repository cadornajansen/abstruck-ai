create table public.material_reading_state (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null,
  extraction_version integer not null check (extraction_version > 0),
  locator jsonb not null default '{"type":"page","page":1}'::jsonb,
  active_tab text not null default 'chat' check (active_tab in ('chat','learn')),
  updated_at timestamptz not null default now(),
  primary key(owner_id, material_id),
  foreign key(material_id, owner_id) references public.materials(id, owner_id) on delete cascade
);
create index material_reading_state_recent_idx on public.material_reading_state(owner_id, updated_at desc);
create index material_reading_state_material_idx on public.material_reading_state(material_id);
alter table public.material_reading_state enable row level security;
create policy reading_state_read_own on public.material_reading_state for select to authenticated
  using ((select auth.uid())=owner_id);
create policy reading_state_insert_own on public.material_reading_state for insert to authenticated
  with check ((select auth.uid())=owner_id);
create policy reading_state_update_own on public.material_reading_state for update to authenticated
  using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.material_reading_state from anon;
grant select, insert, update on public.material_reading_state to authenticated;
grant all on public.material_reading_state to service_role;
