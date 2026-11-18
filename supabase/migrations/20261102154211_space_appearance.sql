-- Space identity is owner-scoped; cover bytes participate in the existing storage allowance.
alter table public.spaces
  add column icon_name text check(icon_name is null or icon_name ~ '^[A-Za-z][A-Za-z0-9]{0,63}$'),
  add column icon_color text check(icon_color is null or icon_color ~ '^#[0-9a-fA-F]{6}$'),
  add column details_revision integer not null default 0 check(details_revision >= 0),
  add constraint spaces_icon_pair_check check((icon_name is null) = (icon_color is null));

alter table public.assets add column space_id uuid;
alter table public.assets add constraint assets_space_owner_fkey
  foreign key(space_id,owner_id) references public.spaces(id,owner_id) on delete cascade;
alter table public.assets add constraint assets_space_role_key unique(space_id,role);
alter table public.assets drop constraint assets_target_check;
alter table public.assets add constraint assets_target_check
  check(num_nonnulls(material_id,study_set_id,space_id)=1);
alter table public.assets drop constraint assets_role_check;
alter table public.assets add constraint assets_role_check check(
  (material_id is not null and role in ('original','normalized_pdf','normalized_audio')) or
  (study_set_id is not null and role in ('study_audio','study_video')) or
  (space_id is not null and role='space_cover' and mime='image/webp' and bytes<=2000000));

-- Publish only a validated, already stored image. A stale editor cannot replace a newer cover.
create function public.set_space_cover(p_owner_id uuid,p_space_id uuid,p_revision integer,
  p_object_key text,p_bytes bigint,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.spaces; account jsonb; previous public.assets;
begin
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then raise exception 'profile_missing'; end if;
  select * into target from public.spaces where id=p_space_id and owner_id=p_owner_id for update;
  if not found then raise exception 'space_not_found'; end if;
  if target.details_revision<>p_revision then raise exception 'space_revision_conflict'; end if;
  select * into previous from public.assets where space_id=target.id and owner_id=p_owner_id and role='space_cover';
  if p_object_key is not null then
    if p_object_key !~ ('^'||p_owner_id::text||'/spaces/'||target.id::text||'/[a-f0-9-]{36}\.webp$') or
      p_bytes is null or p_bytes not between 1 and 2000000 or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
      then raise exception 'invalid_space_cover'; end if;
    account:=public.billing_account_context(p_owner_id);
    if (select coalesce(sum(bytes),0) from public.assets where owner_id=p_owner_id)-coalesce(previous.bytes,0)+p_bytes
      >(account->'limits'->>'storageBytes')::bigint then raise exception 'storage_quota_exceeded'; end if;
  end if;
  delete from public.assets where id=previous.id;
  if p_object_key is not null then
    insert into public.assets(space_id,owner_id,role,object_key,mime,bytes,source_sha256,uploaded_at)
      values(target.id,p_owner_id,'space_cover',p_object_key,'image/webp',p_bytes,p_sha256,now());
  end if;
  update public.spaces set details_revision=details_revision+1,updated_at=now() where id=target.id
    returning * into target;
  return jsonb_build_object('revision',target.details_revision,'previousKey',previous.object_key);
end $$;
revoke all on function public.set_space_cover(uuid,uuid,integer,text,bigint,text) from public,anon,authenticated;
grant execute on function public.set_space_cover(uuid,uuid,integer,text,bigint,text) to service_role;
