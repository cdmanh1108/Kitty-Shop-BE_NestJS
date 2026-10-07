export type RentalEmailEvent = 'CONFIRMED' | 'COMPLETED';

/** Presentation snapshot captured in the owning business transaction. No mutable CRM data is read by delivery. */
export interface RentalEmailSnapshot {
  version: 1;
  event: RentalEmailEvent;
  orderCode: string;
  accountOwned: boolean;
  customerName: string;
  shopName: string;
  contactPhone: string;
  contactEmail: string;
  details: Array<{ label: string; value: string }>;
  items: Array<{ name: string; variant: string; quantity: number; free: boolean }>;
}

export interface RentalEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface ClaimedRentalEmail {
  id: string;
  ownerToken: string;
  recipient: string;
  snapshot: RentalEmailSnapshot | null;
  message: RentalEmailMessage | null;
  attemptCount: number;
}

export const RENTAL_EMAIL_QUEUE = Symbol('RENTAL_EMAIL_QUEUE');
export interface RentalEmailQueue {
  claimNext(now: Date): Promise<ClaimedRentalEmail | null>;
  prepare(claim: ClaimedRentalEmail, message: RentalEmailMessage, now: Date): Promise<boolean>;
  sent(claim: ClaimedRentalEmail, providerMessageId: string, now: Date): Promise<boolean>;
  failed(claim: ClaimedRentalEmail, reason: string, retryable: boolean, now: Date): Promise<void>;
}

export const RENTAL_EMAIL_SENDER = Symbol('RENTAL_EMAIL_SENDER');
export interface RentalEmailSender {
  send(message: RentalEmailMessage, idempotencyKey: string): Promise<string>;
}

export class RentalEmailDeliveryError extends Error {
  constructor(
    public readonly reason: string,
    public readonly retryable: boolean,
  ) {
    super('Không thể gửi email cập nhật đơn thuê.');
  }
}
