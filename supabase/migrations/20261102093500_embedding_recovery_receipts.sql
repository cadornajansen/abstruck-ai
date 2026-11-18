-- A reclaimed submitted batch must hold its versioned ledger reservation.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.claim_material_job(integer,boolean,uuid[])'::regprocedure) into definition;
  if position('feature=''material_embeddings''' in definition)=0 then
    raise exception 'embedding_recovery_definition_changed';
  end if;
  execute replace(definition,'feature=''material_embeddings''','feature=''material_embeddings:''||(job.input->''source_index''->>''extraction_version'')');
end $$;
