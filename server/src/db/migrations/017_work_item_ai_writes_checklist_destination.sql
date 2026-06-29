create table work_item_ai_writes_next (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  run_id text not null references ai_generation_runs(id) on delete restrict,
  source_message_id text references work_item_coach_messages(id) on delete set null,
  destination text not null check (destination in ('description', 'journal', 'checklist')),
  body text not null,
  created_journal_entry_id text references work_item_journal(id) on delete set null,
  created_at text not null
);

insert into work_item_ai_writes_next(
  id,
  work_item_id,
  run_id,
  source_message_id,
  destination,
  body,
  created_journal_entry_id,
  created_at
)
select
  id,
  work_item_id,
  run_id,
  source_message_id,
  destination,
  body,
  created_journal_entry_id,
  created_at
from work_item_ai_writes;

drop table work_item_ai_writes;
alter table work_item_ai_writes_next rename to work_item_ai_writes;

create index idx_work_item_ai_writes_work_item on work_item_ai_writes(work_item_id, created_at);
create index idx_work_item_ai_writes_run on work_item_ai_writes(run_id);
create unique index idx_work_item_ai_writes_source_message
  on work_item_ai_writes(source_message_id)
  where source_message_id is not null;
