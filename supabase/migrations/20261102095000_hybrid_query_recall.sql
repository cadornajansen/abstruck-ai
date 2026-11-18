create or replace function public.hybrid_source_search(p_material_ids uuid[],p_query text,p_embedding extensions.vector default null,p_request_id uuid default null)
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
), strict_query as (select websearch_to_tsquery('english',p_query) as terms),
query as (
  select case when exists(select 1 from eligible e where e.search_text@@s.terms) then s.terms else
    to_tsquery('english',array_to_string(array(select quote_literal(term)
      from unnest(tsvector_to_array(to_tsvector('english',p_query))) term),' | ')) end as terms from strict_query s
),
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
    from eligible e left join ranked r on r.id=e.id order by score desc,similarity desc,e.ordinal,e.id limit 16
)
select e.id,e.material_id,e.title,e.ordinal,e.locator,
  case when octet_length(e.text)<=8000 then e.text else substr(e.text,greatest(1,coalesce(
    (select min(nullif(strpos(lower(e.text),term),0)) from unnest(tsvector_to_array(to_tsvector('english',p_query))) term),1)-600),3000) end,
  a.ready,e.score from chosen e cross join available a order by e.score desc,e.similarity desc,e.ordinal,e.id;
$$;
