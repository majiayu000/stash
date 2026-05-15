create table progress_evidence (
  id text primary key,
  work_item_id text not null,
  session_id text,
  provider text,
  kind text not null,
  text text not null,
  source_path text,
  pending_acceptance integer not null default 0,
  timestamp text not null,
  foreign key (work_item_id) references work_items(id) on delete cascade
);

create index idx_evidence_work_item on progress_evidence(work_item_id);
create index idx_evidence_pending on progress_evidence(pending_acceptance);
create index idx_evidence_session on progress_evidence(provider, session_id);
