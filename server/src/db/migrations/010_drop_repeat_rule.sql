-- 0.1.12 — drop legacy repeat_rule column.
-- Recurrence is handled by the structured `recurrence` field (RRULE-lite +
-- after_completion); repeat_rule was the v0.1 stub and never had any writer
-- on the client side. No back-compat — per project rule "不要做任何向后兼容".

alter table work_items drop column repeat_rule;
