-- Codex input_tokens includes cached_input_tokens. Usage cached before this
-- migration stored those classes as overlapping values, so invalidate only
-- Codex usage and let the unchanged source file be reparsed on demand.
update agent_session_cache
   set usage_json = 'null'
 where provider = 'codex'
   and usage_json <> 'null';
