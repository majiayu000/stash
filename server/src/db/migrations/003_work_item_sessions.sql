create table work_item_sessions (
  work_item_id text not null,
  provider text not null,
  session_id text not null,
  linked_at text not null,
  primary key (work_item_id, provider, session_id),
  foreign key (work_item_id) references work_items(id) on delete cascade
);

create index idx_work_item_sessions_session on work_item_sessions(provider, session_id);
