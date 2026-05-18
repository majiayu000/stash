-- 0.1.12 — persisted area emoji.
-- The workbench renders an emoji glyph next to every project. Until now it was
-- derived from a hash of the area id — the visual changed every time we changed
-- the hash. Areas are user-named; the emoji should travel with them.

alter table areas add column emoji text;
