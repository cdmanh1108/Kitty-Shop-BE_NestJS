import type { ReminderRecord } from '@modules/reminders/domain/reminders.records';

export const REMINDER_STATUSES = ['PENDING', 'DISMISSED', 'RESOLVED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_TYPES = [
  'PICKUP_TODAY',
  'RETURN_TODAY',
  'RETURN_SOON',
  'OVERDUE',
  'PAYMENT_DUE',
  'DEPOSIT_DUE',
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export interface ReminderListItem extends ReminderRecord {
  customer: null | { phone: string; fullName: string };
  order: null | { status: string; orderNumber: string };
}

export interface ReminderListSummary {
  pickupToday: number;
  returnToday: number;
  overdue: number;
  paymentDue: number;
  depositDue: number;
}

export interface ReminderPage {
  items: ReminderListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  summary: ReminderListSummary;
}

export type ReminderResult = null | ReminderRecord;
