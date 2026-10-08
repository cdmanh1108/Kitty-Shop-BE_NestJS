import type { ReminderStatus, ReminderType } from '../domain/reminder.models';

export interface ReminderListQuery {
  page: number;
  limit: number;
  status?: ReminderStatus;
  type?: ReminderType;
  search?: string;
}
