create table public.study_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null,
  space_id uuid,
  type text not null check (type in ('notes','summary','flashcards')),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  status text not null default 'draft' check (status in ('draft','queued','generating','ready','failed')),
  draft_content jsonb not null default '{"markdown":""}'::jsonb,
  draft_revision integer not null default 0 check (draft_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, owner_id),
  foreign key(material_id, owner_id) references public.materials(id, owner_id) on delete cascade,
  foreign key(space_id, owner_id) references public.spaces(id, owner_id) on delete set null (space_id),
  check (type <> 'notes' or (
    jsonb_typeof(draft_content)='object' and
    jsonb_typeof(draft_content->'markdown')='string' and
    char_length(draft_content->>'markdown') <= 100000
  ))
);
create index study_sets_owner_updated_idx on public.study_sets(owner_id, updated_at desc);
create index study_sets_material_owner_idx on public.study_sets(material_id, owner_id);
create index study_sets_space_owner_idx on public.study_sets(space_id, owner_id);

create table public.study_set_versions (
  id uuid primary key default gen_random_uuid(),
  study_set_id uuid not null,
  owner_id uuid not null,
  version integer not null check (version > 0),
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(study_set_id, version),
  unique(id, owner_id),
  foreign key(study_set_id, owner_id) references public.study_sets(id, owner_id) on delete cascade
);
create index study_set_versions_owner_idx on public.study_set_versions(owner_id);

create table public.study_set_sources (
  version_id uuid not null,
  material_id uuid not null,
  owner_id uuid not null,
  extraction_version integer not null check (extraction_version > 0),
  primary key(version_id, material_id),
  foreign key(version_id, owner_id) references public.study_set_versions(id, owner_id) on delete cascade,
  foreign key(material_id, owner_id) references public.materials(id, owner_id) on delete cascade
);
create index study_set_sources_material_owner_idx on public.study_set_sources(material_id, owner_id);
create index study_set_sources_owner_idx on public.study_set_sources(owner_id);

create table public.study_items (
  id uuid primary key default gen_random_uuid(),
  logical_id uuid not null default gen_random_uuid(),
  version_id uuid not null,
  owner_id uuid not null,
  position integer not null check (position > 0),
  kind text not null check (kind in ('flashcard','question')),
  prompt jsonb not null,
  answer jsonb not null,
  rubric jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  unique(version_id, position),
  unique(version_id, logical_id),
  unique(id, owner_id),
  foreign key(version_id, owner_id) references public.study_set_versions(id, owner_id) on delete cascade
);
create index study_items_owner_idx on public.study_items(owner_id);

alter table public.study_sets enable row level security;
alter table public.study_set_versions enable row level security;
alter table public.study_set_sources enable row level security;
alter table public.study_items enable row level security;

create policy study_sets_read_own on public.study_sets for select to authenticated
  using ((select auth.uid())=owner_id);
create policy study_set_versions_read_own on public.study_set_versions for select to authenticated
  using ((select auth.uid())=owner_id);
create policy study_set_sources_read_own on public.study_set_sources for select to authenticated
  using ((select auth.uid())=owner_id);
-- Answer-bearing assessment items need a submission-aware API before exposure.
create policy study_items_read_own_flashcards on public.study_items for select to authenticated
  using ((select auth.uid())=owner_id and kind='flashcard');

revoke all on public.study_sets, public.study_set_versions, public.study_set_sources, public.study_items
  from anon, authenticated, service_role;
grant select on public.study_sets, public.study_set_versions, public.study_set_sources, public.study_items to authenticated;
grant select, insert, update, delete on public.study_sets to service_role;
-- Published content is append-only; edits create a new version, never UPDATE.
grant select, insert, delete on public.study_set_versions, public.study_set_sources, public.study_items to service_role;
