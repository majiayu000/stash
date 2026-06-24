create table meeting_triage_sources (
  id text primary key,
  title text,
  body text not null,
  source_path text,
  created_at text not null
);

alter table decision_drafts add column review_flags_json text not null default '[]';
alter table decision_drafts add column review_reason text;

create index idx_meeting_triage_sources_created on meeting_triage_sources(created_at);
