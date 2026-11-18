create function public.create_untitled_space(p_owner_id uuid, p_space_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_space public.spaces;
  candidate text := 'Untitled Space';
  suffix integer := -1;
begin
  if p_owner_id is null or p_space_id is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;

  -- Serialize default-name selection across this owner's tabs.
  perform 1 from public.profiles where id = p_owner_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into existing_space from public.spaces where id = p_space_id;
  if found then
    if existing_space.owner_id <> p_owner_id then
      return jsonb_build_object('error', 'not_found');
    end if;
    return jsonb_build_object('id', existing_space.id);
  end if;

  while exists (
    select 1 from public.spaces where owner_id = p_owner_id and title = candidate
  ) loop
    suffix := suffix + 1;
    candidate := format('Untitled Space (%s)', suffix);
  end loop;

  insert into public.spaces(id, owner_id, title)
  values (p_space_id, p_owner_id, candidate);
  return jsonb_build_object('id', p_space_id);
end;
$$;

revoke all on function public.create_untitled_space(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_untitled_space(uuid, uuid) to service_role;
