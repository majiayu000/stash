create table dispatch_runs (
  id text primary key,
  work_item_id text not null references work_items(id) on delete cascade,
  provider text not null check (provider in ('claude', 'codex')),
  cwd text not null,
  prompt_file text not null,
  prompt_hash text not null,
  spawn_command text not null,
  pid integer,
  status text not null check (status in ('pending', 'spawned', 'failed', 'matched', 'closed')),
  error text,
  matched_session_id text,
  created_at text not null,
  updated_at text not null,
  closed_at text
);

create index idx_dispatch_runs_work_item on dispatch_runs(work_item_id);
create index idx_dispatch_runs_status on dispatch_runs(status);
create index idx_dispatch_runs_matched_session on dispatch_runs(matched_session_id);

create table decision_candidates (
  id text primary key,
  project_id text,
  provider text not null check (provider in ('claude', 'codex')),
  session_id text not null,
  source_path text not null,
  raw text not null,
  title text not null,
  timestamp text not null,
  status text not null check (status in ('candidate', 'accepted', 'ignored')),
  decision_id text,
  created_at text not null,
  updated_at text not null,
  accepted_at text,
  ignored_at text
);

create index idx_decision_candidates_project on decision_candidates(project_id);
create index idx_decision_candidates_session on decision_candidates(provider, session_id);
create index idx_decision_candidates_status on decision_candidates(status);
