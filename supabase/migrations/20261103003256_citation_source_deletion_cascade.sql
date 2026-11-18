-- Citation links depend on source segments; saved message text does not.
alter table public.message_citations
  drop constraint message_citations_source_segment_id_fkey,
  add constraint message_citations_source_segment_id_fkey
    foreign key (source_segment_id) references public.source_segments(id)
    on delete cascade;
