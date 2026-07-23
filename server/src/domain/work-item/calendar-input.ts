import {
  add_calendar_days,
  assert_utc_instant,
  calendar_date_at,
  parse_calendar_date,
  parse_local_date_time,
  zoned_date_time_to_instant,
  type Clock,
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
} from '@stash/shared';

export interface ResolvedWorkItemCalendarFields {
  scheduled_for?: string;
  reminder_at?: string;
}

export function resolve_work_item_calendar_fields(
  input: CreateWorkItemInput | UpdateWorkItemInput,
  clock: Clock,
  time_zone: string,
): ResolvedWorkItemCalendarFields {
  if (input.scheduledFor !== undefined && input.scheduledForRelative !== undefined) {
    throw new Error('scheduledFor and scheduledForRelative are mutually exclusive');
  }
  if (input.reminderAt !== undefined && input.reminderLocalDateTime !== undefined) {
    throw new Error('reminderAt and reminderLocalDateTime are mutually exclusive');
  }

  validate_calendar_date(input.scheduledFor, 'scheduledFor');
  validate_calendar_date(input.dueAt, 'dueAt');
  validate_calendar_date(input.reviewAt, 'reviewAt');
  validate_calendar_date(input.recurrence?.until, 'recurrence.until');
  validate_instant(input.reminderAt, 'reminderAt');
  validate_instant(input.startAt, 'startAt');

  let scheduled_for: string | undefined;
  if (input.scheduledForRelative !== undefined) {
    const today = calendar_date_at(clock.now(), time_zone);
    scheduled_for = input.scheduledForRelative === 'tomorrow'
      ? add_calendar_days(today, 1)
      : today;
  }

  let reminder_at: string | undefined;
  if (input.reminderLocalDateTime !== undefined) {
    reminder_at = new Date(zoned_date_time_to_instant(
      parse_local_date_time(input.reminderLocalDateTime),
      time_zone,
    )).toISOString();
  }
  return { scheduled_for, reminder_at };
}

function validate_calendar_date(
  value: string | null | undefined,
  field: string,
): void {
  if (value === undefined || value === null) return;
  try {
    parse_calendar_date(value);
  } catch {
    throw new Error(`${field} must be a Gregorian calendar date YYYY-MM-DD`);
  }
}

function validate_instant(value: string | null | undefined, field: string): void {
  if (value === undefined || value === null) return;
  try {
    assert_utc_instant(value);
  } catch {
    throw new Error(`${field} must be a valid UTC instant ending in Z`);
  }
}
