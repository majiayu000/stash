create table work_item_coach_messages (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  run_id text references ai_generation_runs(id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  purpose text not null check (purpose in ('chat', 'summary')),
  body text not null,
  provider text,
  model text,
  created_at text not null
);

create index idx_work_item_coach_messages_work_item on work_item_coach_messages(work_item_id, created_at);
create index idx_work_item_coach_messages_run on work_item_coach_messages(run_id);

create table work_item_ai_writes (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  run_id text not null references ai_generation_runs(id) on delete restrict,
  source_message_id text references work_item_coach_messages(id) on delete set null,
  destination text not null check (destination in ('description', 'journal')),
  body text not null,
  created_journal_entry_id text references work_item_journal(id) on delete set null,
  created_at text not null
);

create index idx_work_item_ai_writes_work_item on work_item_ai_writes(work_item_id, created_at);
create index idx_work_item_ai_writes_run on work_item_ai_writes(run_id);
create unique index idx_work_item_ai_writes_source_message
  on work_item_ai_writes(source_message_id)
  where source_message_id is not null;
