create table work_items (
  id text primary key,
  project_id text,
  area_id text,
  parent_id text,
  title text not null,
  description text,
  kind text not null,
  status text not null,
  priority text not null,
  source text not null default 'manual',
  confidence text not null default 'explicit',
  assignee text not null default 'human',
  labels_json text not null default '[]',
  checklist_json text not null default '[]',
  outcome text,
  context text,
  estimate_minutes integer,
  reminder_at text,
  repeat_rule text,
  blocked_by text,
  waiting_on text,
  links_json text not null default '[]',
  review_at text,
  start_at text,
  due_at text,
  scheduled_for text,
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create index idx_work_items_status on work_items(status);
create index idx_work_items_scheduled on work_items(scheduled_for);
create index idx_work_items_project on work_items(project_id);
create index idx_work_items_area on work_items(area_id);
create index idx_work_items_parent on work_items(parent_id);
