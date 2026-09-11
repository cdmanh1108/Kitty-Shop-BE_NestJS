import type { ReminderList, ReminderResult } from './reminder.models';
export interface ReminderOrderCandidate {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  depositStatus: string;
  depositRequired: number;
  rentalStartAt: Date;
  rentalEndAt: Date;
  customerId: string;
  customerName: string;
  customerPhone: string;
}

export interface ActiveShop {
  id: string;
  timezone: string;
}

export const REMINDER_REPOSITORY = Symbol('REMINDER_REPOSITORY');

export interface ReminderRepository {
  activeShops(): Promise<ActiveShop[]>;
  candidates(shopId: string): Promise<ReminderOrderCandidate[]>;
  upsert(input: ReminderUpsertData): Promise<void>;
  resolveMissing(shopId: string, activeKeys: string[]): Promise<void>;
  list(shopId: string, status?: string): Promise<ReminderList>;
  dismiss(shopId: string, id: string, dismissedBy: string): Promise<ReminderResult>;
}

export interface ReminderUpsertData {
  shopId: string;
  orderId: string;
  customerId: string;
  dedupeKey: string;
  type: string;
  scheduledFor: Date;
  priority: number;
  title: string;
  content: string;
}
