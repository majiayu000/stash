create table agent_session_cache (
  provider text not null,
  source_path text not null,
  mtime_ms real not null,
  size_bytes integer not null,
  session_json text not null,
  usage_json text not null,
  indexed_at text not null,
  primary key (provider, source_path)
);

create index idx_agent_session_cache_provider on agent_session_cache(provider);
create index idx_agent_session_cache_indexed_at on agent_session_cache(indexed_at);
