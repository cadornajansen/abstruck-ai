create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  onboarding_completed_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index spaces_owner_created_idx on public.spaces (owner_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy spaces_select_own on public.spaces for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy spaces_insert_own on public.spaces for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy spaces_update_own on public.spaces for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy spaces_delete_own on public.spaces for delete to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.profiles, public.spaces from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
