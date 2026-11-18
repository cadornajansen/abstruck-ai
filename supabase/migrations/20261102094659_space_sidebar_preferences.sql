alter table public.spaces add column is_pinned boolean not null default false;
alter table public.spaces add column sort_order integer check(sort_order>=0);

create function public.pin_space(p_owner_id uuid,p_space_id uuid,p_pinned boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare space public.spaces;
begin
  if p_pinned is null then return jsonb_build_object('status','invalid'); end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into space from public.spaces where id=p_space_id and owner_id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if space.is_pinned<>p_pinned then
    update public.spaces set is_pinned=p_pinned,sort_order=null where id=space.id returning * into space;
  end if;
  return jsonb_build_object('status','ok','space',jsonb_build_object('id',space.id,'isPinned',space.is_pinned,'sortOrder',space.sort_order));
end $$;

create function public.reorder_spaces(p_owner_id uuid,p_pinned boolean,p_space_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_count integer; ordered jsonb;
begin
  if p_pinned is null or p_space_ids is null or cardinality(p_space_ids)>500 or
    coalesce(array_ndims(p_space_ids),1)<>1 or
    (select count(distinct id) from unnest(p_space_ids) id)<>cardinality(p_space_ids) then
    return jsonb_build_object('status','invalid');
  end if;
  perform 1 from public.profiles where id=p_owner_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  -- Pin and reorder share this lock; lock existing rows in the same order as each other.
  perform 1 from public.spaces where owner_id=p_owner_id order by id for update;
  if exists(select 1 from unnest(p_space_ids) requested(id) where not exists
    (select 1 from public.spaces where id=requested.id and owner_id=p_owner_id)) then
    return jsonb_build_object('status','not_found');
  end if;
  select count(*) into current_count from public.spaces where owner_id=p_owner_id and is_pinned=p_pinned;
  if current_count<>cardinality(p_space_ids) or exists(select 1 from public.spaces
    where owner_id=p_owner_id and id=any(p_space_ids) and is_pinned<>p_pinned) then
    return jsonb_build_object('status','conflict');
  end if;
  update public.spaces space set sort_order=(requested.position-1)::integer
    from unnest(p_space_ids) with ordinality requested(id,position)
    where space.id=requested.id and space.owner_id=p_owner_id and space.is_pinned=p_pinned
      and space.sort_order is distinct from (requested.position-1)::integer;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'isPinned',is_pinned,'sortOrder',sort_order)
    order by sort_order asc nulls last,created_at desc,id),'[]') into ordered
    from public.spaces where owner_id=p_owner_id and is_pinned=p_pinned;
  return jsonb_build_object('status','ok','spaces',ordered);
end $$;

revoke all on function public.pin_space(uuid,uuid,boolean),public.reorder_spaces(uuid,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.pin_space(uuid,uuid,boolean),public.reorder_spaces(uuid,boolean,uuid[]) to service_role;
