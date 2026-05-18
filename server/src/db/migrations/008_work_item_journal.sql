-- v0.8 — per-todo dated journal log.
-- Append-only by design; deletes allowed but UI doesn't surface edit on body
-- (use a new entry if you change your mind). Each entry is a single string
-- (markdown OK). Cascade delete with the work item.

create table work_item_journal (
  id           text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  body         text not null,
  created_at   text not null
);

create index idx_wij_work_item on work_item_journal(work_item_id);
create index idx_wij_created   on work_item_journal(created_at);
