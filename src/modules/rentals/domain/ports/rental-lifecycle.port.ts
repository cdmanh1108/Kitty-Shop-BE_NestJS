import type { RentalOrderDetails } from '../rental.models';
import type { ConfirmRentalData } from '../rental-confirmation';
import type { RentalOrderSource } from '../rental-order-source';
import type { RentalStatus } from '../rental-status';

export interface RentalLifecycleRepository {
  confirm(input: ConfirmRentalData): Promise<RentalOrderDetails>;
  transition(input: RentalTransitionData): Promise<RentalOrderDetails>;
  receiveReturn(input: ReceiveRentalReturnData): Promise<RentalOrderDetails>;
  settleOrder(input: SettleRentalOrderData): Promise<RentalOrderDetails>;
  reschedule(input: RentalRescheduleData): Promise<RentalOrderDetails>;
  addCharge(input: RentalAddChargeData): Promise<RentalOrderDetails>;
  returnCollateral(shopId: string, orderId: string, changedBy: string): Promise<RentalOrderDetails>;
}

export const RENTAL_LIFECYCLE_REPOSITORY = Symbol('RENTAL_LIFECYCLE_REPOSITORY');

export interface ReceiveRentalReturnData {
  shopId: string;
  orderId: string;
  actualReturnedAt?: Date;
  actorMemberId: string;
  actorUserId: string;
  actorName: string;
  items: Array<{
    inventoryItemId: string;
    condition: string;
    note?: string;
    lateFeeOverride?: { amount: number; reason: string };
    charge?: { chargeType: string; amount: number; description?: string };
  }>;
  manualCharges?: Array<{
    chargeType: string;
    amount: number;
    description?: string;
    quantity?: number;
  }>;
  note?: string;
  feePreviewToken?: string;
}

export interface SettleRentalOrderData {
  feeOverrides?: Array<{ inventoryItemId: string; amount: number; reason: string }>;
  feePreviewToken?: string;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  shopId: string;
  orderId: string;
  actorMemberId: string;
  actorUserId: string;
  actorName: string;
  settlementType?: string;
  note?: string;
  returnDocument?: boolean;
  evidence?: { key: string; filename: string; mimeType: string; size: number };
}

export interface RentalTransitionData {
  shopId: string;
  orderId: string;
  fromStatuses: RentalStatus[];
  toStatus: RentalStatus;
  /** Staff actor when the transition originates from an Admin command. */
  changedBy?: string;
  reason?: string;
  /** Optional server-owned scope guards for account-owned transitions. */
  expectedWebAccountId?: string;
  expectedSource?: RentalOrderSource;
  expectedPaymentStatus?: string;
  /** Reject cancellation if any completed, non-voided ledger movement exists. */
  requireNoCompletedPayments?: boolean;
}

export interface RentalRescheduleData {
  shopId: string;
  orderId: string;
  from: Date;
  until: Date;
  changedBy: string;
}

export interface RentalAddChargeData {
  shopId: string;
  orderId: string;
  chargeType: string;
  description?: string;
  amount: number;
  quantity: number;
  createdBy: string;
}
