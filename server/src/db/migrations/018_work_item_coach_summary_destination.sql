alter table work_item_coach_messages
  add column summary_destination text
    check (
      summary_destination is null
      or summary_destination in ('description', 'journal', 'checklist')
    );
