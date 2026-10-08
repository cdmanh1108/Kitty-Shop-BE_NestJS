import type { ReminderPage, ReminderResult, ReminderStatus, ReminderType } from './reminder.models';
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

/** Immutable application-calculated boundaries for one reminder refresh run. */
export interface ReminderCandidateCriteria {
  shopId: string;
  now: Date;
  dayStart: Date;
  dayEnd: Date;
  returnSoonEnd: Date;
}

export interface ReminderCandidatePageRequest extends ReminderCandidateCriteria {
  /** Internal keyset cursor: the last immutable RentalOrder ID processed for this shop. */
  cursor?: string;
  limit: number;
}

export interface ReminderCandidatePage {
  items: ReminderOrderCandidate[];
  nextCursor: string | null;
}

export interface ReminderListCriteria {
  shopId: string;
  page: number;
  limit: number;
  status?: ReminderStatus;
  type?: ReminderType;
  search?: string;
}

export const REMINDER_REPOSITORY = Symbol('REMINDER_REPOSITORY');

export interface ReminderRepository {
  activeShops(): Promise<ActiveShop[]>;
  candidatePage(input: ReminderCandidatePageRequest): Promise<ReminderCandidatePage>;
  upsert(input: ReminderUpsertData): Promise<void>;
  resolveMissing(shopId: string, activeKeys: string[]): Promise<number>;
  list(input: ReminderListCriteria): Promise<ReminderPage>;
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
