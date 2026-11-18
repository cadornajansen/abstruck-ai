-- Empty p_title completes onboarding without a space; retain the existing RPC signature.
create or replace function public.complete_onboarding(
  p_intent text,
  p_name text,
  p_school text,
  p_course text,
  p_title text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_id uuid := auth.uid();
  profile public.profiles%rowtype;
  first_space_id uuid;
begin
  if user_id is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_intent not in ('understand', 'exam', 'organise') or p_intent is null
    or p_title is null or char_length(btrim(p_title)) > 120
    or char_length(coalesce(p_name, '')) > 100
    or char_length(coalesce(p_school, '')) > 160
    or char_length(coalesce(p_course, '')) > 160 then
    raise exception 'Invalid onboarding details' using errcode = '22023';
  end if;

  insert into public.profiles(id) values(user_id) on conflict (id) do nothing;
  select * into profile from public.profiles where id=user_id for update;

  if profile.onboarding_completed_at is not null then
    select id into first_space_id from public.spaces
      where owner_id=user_id and id::text=profile.preferences->>'first_space_id';
    return first_space_id;
  end if;

  if btrim(p_title) <> '' then
    insert into public.spaces(owner_id, title) values(user_id, btrim(p_title))
      returning id into first_space_id;
  end if;
  update public.profiles set
    display_name=nullif(btrim(coalesce(p_name, '')), ''),
    preferences=(case when jsonb_typeof(preferences)='object' then preferences else '{}'::jsonb end)
      || jsonb_build_object(
        'study_intent', p_intent,
        'school', nullif(btrim(coalesce(p_school, '')), ''),
        'course', nullif(btrim(coalesce(p_course, '')), ''),
        'first_space_id', first_space_id
      ),
    onboarding_completed_at=now()
    where id=user_id;
  return first_space_id;
end;
$$;

revoke all on function public.complete_onboarding(text,text,text,text,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,text,text,text) to authenticated;
