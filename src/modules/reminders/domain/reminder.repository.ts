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
  upsert(input: {
    shopId: string;
    orderId: string;
    customerId: string;
    dedupeKey: string;
    type: string;
    scheduledFor: Date;
    priority: number;
    title: string;
    content: string;
  }): Promise<void>;
  resolveMissing(shopId: string, activeKeys: string[]): Promise<void>;
  list(shopId: string, status?: string): Promise<unknown[]>;
  dismiss(shopId: string, id: string, dismissedBy: string): Promise<unknown | null>;
}
