import type { ReminderRecord } from '@modules/reminders/domain/reminders.records';

export type ReminderList = Array<
  ReminderRecord & {
    customer: null | {
      phone: string;
      fullName: string;
    };
    order: null | {
      status: string;
      orderNumber: string;
    };
  }
>;

export type ReminderResult = null | ReminderRecord;
