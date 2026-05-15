create table areas (
  id text primary key,
  name text not null unique,
  description text,
  review_cadence text not null default 'weekly',
  created_at text not null,
  updated_at text not null
);

create index idx_areas_name on areas(name);
