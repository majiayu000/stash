-- Skill catalog (per SPEC v0.2 §3a). Local-only; no external registry sync in v0.2.
-- Stash treats skills as opt-in capability bundles bound to projects (areas).
create table skills (
  id           text primary key,            -- e.g. 'rust-best-practices'
  name         text not null,
  emoji        text not null default '🧩',
  description  text,
  source       text not null default 'community', -- 'official' | 'community'
  stars        integer not null default 0,
  installed    integer not null default 0,  -- 0 = browsable, 1 = installed
  version      text,
  created_at   text not null,
  updated_at   text not null
);

create index idx_skills_installed on skills(installed);
create index idx_skills_source on skills(source);

-- Project-to-skill bindings. When a session starts on the project, its bound
-- skills auto-load as context. `enabled` allows soft-disable without unbinding.
create table project_skills (
  area_id    text not null references areas(id) on delete cascade,
  skill_id   text not null references skills(id) on delete cascade,
  enabled    integer not null default 1,
  bound_at   text not null,
  primary key (area_id, skill_id)
);

create index idx_project_skills_area on project_skills(area_id);
create index idx_project_skills_skill on project_skills(skill_id);
