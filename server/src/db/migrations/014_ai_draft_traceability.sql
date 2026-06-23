create table ai_generation_runs (
  id text primary key,
  feature text not null check (
    feature in (
      'idea_decomposition',
      'task_coach',
      'coach_summary',
      'meeting_triage',
      'session_inferred',
      'manual_split'
    )
  ),
  source_kind text not null check (
    source_kind in (
      'idea_decomposition',
      'meeting_triage',
      'session_inferred',
      'manual_split',
      'task_coach',
      'coach_summary'
    )
  ),
  source_work_item_id text references work_items(id) on delete set null,
  source_record_id text,
  source_path text,
  provider text not null,
  model text,
  prompt_hash text not null,
  status text not null check (status in ('pending', 'succeeded', 'failed', 'accepted', 'discarded')),
  raw_response_json text,
  error text,
  created_at text not null,
  updated_at text not null,
  accepted_at text
);

create index idx_ai_generation_runs_source_work_item on ai_generation_runs(source_work_item_id);
create index idx_ai_generation_runs_feature_status on ai_generation_runs(feature, status);
create index idx_ai_generation_runs_source_kind on ai_generation_runs(source_kind);

create table decision_drafts (
  id text primary key,
  run_id text not null references ai_generation_runs(id) on delete cascade,
  source_kind text not null check (
    source_kind in (
      'idea_decomposition',
      'meeting_triage',
      'session_inferred',
      'manual_split'
    )
  ),
  source_work_item_id text references work_items(id) on delete set null,
  source_record_id text,
  source_path text,
  source_spans_json text not null default '[]',
  proposed_title text not null,
  proposed_description text,
  proposed_kind text not null default 'task',
  proposed_priority text not null default 'p2',
  proposed_labels_json text not null default '[]',
  proposed_scheduled_for text,
  proposed_due_at text,
  proposed_checklist_json text not null default '[]',
  sort_order real,
  status text not null check (status in ('draft', 'accepted', 'rejected', 'edited')),
  reject_reason text,
  created_work_item_id text references work_items(id),
  accepted_at text,
  rejected_at text,
  created_at text not null,
  updated_at text not null
);

create index idx_decision_drafts_run on decision_drafts(run_id);
create index idx_decision_drafts_status on decision_drafts(status);
create index idx_decision_drafts_source_work_item on decision_drafts(source_work_item_id);
create index idx_decision_drafts_created_work_item on decision_drafts(created_work_item_id);
