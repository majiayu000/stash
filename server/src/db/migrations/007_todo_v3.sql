-- SPEC v0.3 §3a — Friction Zero schema additions.
-- Today_pinned is orthogonal to all date columns; manual flag wins over date logic.
-- sort_order is per-view fractional ordering; NULL means use default sort.
-- recurrence_json holds the RRULE-lite + after_completion rule.
-- raw_input preserves the original capture string before token parsing.

alter table work_items add column today_pinned   integer not null default 0;
alter table work_items add column sort_order     real;
alter table work_items add column recurrence_json text;
alter table work_items add column raw_input      text;

create index idx_work_items_today_pinned on work_items(today_pinned) where today_pinned = 1;
