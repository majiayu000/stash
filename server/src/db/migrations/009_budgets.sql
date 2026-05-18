-- v0.9 — persisted spend budgets.
-- Each row caps USD spend for a scope over a period.
-- scope: free-form label (e.g. "aurora-api", "all"). If it matches an area name,
--        UI shows the spend computed from per-project burn; otherwise scope is
--        purely descriptive and the user reports against it manually.
-- period: 'day' | 'week' | 'month' | 'quarter' (week = ISO week, month = calendar).

create table budgets (
  id           text primary key,
  scope        text not null,
  cap_usd      real not null,
  period       text not null default 'month',
  notes        text,
  created_at   text not null,
  updated_at   text not null
);

create unique index idx_budgets_scope_period on budgets(scope, period);
