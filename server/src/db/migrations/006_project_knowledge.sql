-- Per SPEC v0.2 §3b. Knowledge that lives inside a project (area):
-- intent (one row), milestones (list), decisions (list), notes (one row),
-- lessons (list, project_id nullable so lessons can be cross-project).
-- The "project" naming in routes maps to area_id internally.

create table project_intent (
  area_id    text primary key references areas(id) on delete cascade,
  text       text not null,
  updated_at text not null
);

create table milestones (
  id         text primary key,
  area_id    text not null references areas(id) on delete cascade,
  name       text not null,
  date       text,
  status     text not null default 'planned',  -- 'planned' | 'wip' | 'done'
  progress   integer not null default 0,
  created_at text not null,
  updated_at text not null
);
create index idx_milestones_area on milestones(area_id);

create table decisions (
  id         text primary key,
  area_id    text not null references areas(id) on delete cascade,
  date       text not null,
  title      text not null,
  body       text not null default '',
  tags       text not null default '[]',       -- JSON array
  session_id text,                              -- optional FK-like reference; provider:id
  created_at text not null,
  updated_at text not null
);
create index idx_decisions_area on decisions(area_id);
create index idx_decisions_date on decisions(date);

create table project_notes (
  area_id    text primary key references areas(id) on delete cascade,
  markdown   text not null default '',
  updated_at text not null
);

create table lessons (
  id         text primary key,
  area_id    text,                              -- nullable: NULL = cross-project lesson
  title      text not null,
  body       text not null default '',
  tags       text not null default '[]',       -- JSON array
  cross      integer not null default 0,        -- 1 = surfaced in cross-project search
  created_at text not null,
  updated_at text not null,
  foreign key (area_id) references areas(id) on delete cascade
);
create index idx_lessons_area on lessons(area_id);
create index idx_lessons_cross on lessons(cross);
