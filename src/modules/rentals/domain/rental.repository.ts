import type { RentalStatus } from './rental-status';
import type { ConfirmRentalData } from './rental-confirmation';
import type { JsonSerialized } from '@common/types/json';
import type { RentalOrderDetails, RentalOrderPage } from './rental.models';

export class RentalOverlapError extends Error {
  constructor() {
    super('Một hoặc nhiều món đồ không còn trống trong khoảng thời gian đã chọn.');
  }
}

export { RentalInventoryUnavailableError } from './rental-errors';

export interface BookableVariant {
  id: string;
  variantCode: string;
  productId: string;
  productName: string;
  sizeName: string | null;
  colorName: string | null;
  depositPerItem: number;
  ratePrice: number | null;
  availableInventory: Array<{ id: string; sku: string }>;
}

export type IdempotencyClaim =
  | { state: 'CLAIMED'; claimId: string }
  | { state: 'IN_PROGRESS' }
  | { state: 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonSerialized<RentalOrderDetails> };

export interface CreateRentalOrderData {
  orderNumber: string;
  shopId: string;
  customerId: string;
  locationId?: string;
  rentalStartAt: Date;
  rentalEndAt: Date;
  discountTotal: number;
  note?: string;
  internalNote?: string;
  createdBy?: string;
  idempotency?: { scope: string; key: string; claimId: string };
  lines: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitRentalPrice: number;
    depositAmount: number;
    lineTotal: number;
    pricingSnapshot: { durationDays: number; unitRentalPrice: number; depositPerItem: number };
    inventory: Array<{ id: string; sku: string }>;
  }>;
  charges: Array<{ chargeType: string; description?: string; amount: number; quantity: number }>;
  delivery?: {
    direction: string;
    method: string;
    scheduledAt?: Date;
    recipientName?: string;
    recipientPhone?: string;
    addressLine?: string;
    ward?: string;
    district?: string;
    city?: string;
    province?: string;
    shippingFee: number;
  };
  collateral?: { method: 'CASH' | 'DOCUMENT'; documentType?: 'CCCD' | 'GPLX' };
}

export const RENTAL_REPOSITORY = Symbol('RENTAL_REPOSITORY');

export interface RentalRepository {
  confirm(input: ConfirmRentalData): Promise<RentalOrderDetails>;
  customerExists(shopId: string, customerId: string): Promise<boolean>;
  locationExists(shopId: string, locationId: string): Promise<boolean>;
  getBookableVariant(input: RentalGetBookableVariantData): Promise<BookableVariant | null>;
  createOrder(data: CreateRentalOrderData): Promise<RentalOrderDetails>;
  list(input: RentalListCriteria): Promise<RentalOrderPage>;
  get(shopId: string, id: string): Promise<RentalOrderDetails>;
  getStatus(shopId: string, id: string): Promise<string | null>;
  getSchedule(
    shopId: string,
    id: string,
  ): Promise<{ status: string; rentalStartAt: Date; rentalEndAt: Date } | null>;
  transition(input: RentalTransitionData): Promise<RentalOrderDetails>;
  receiveReturn(input: ReceiveRentalReturnData): Promise<RentalOrderDetails>;
  settleOrder(input: SettleRentalOrderData): Promise<RentalOrderDetails>;
  getReturnPreview(shopId: string, orderId: string, returnedAt?: Date): Promise<ReturnPreviewData>;
  reschedule(input: RentalRescheduleData): Promise<RentalOrderDetails>;
  addCharge(input: RentalAddChargeData): Promise<RentalOrderDetails>;
  returnCollateral(shopId: string, orderId: string, changedBy: string): Promise<RentalOrderDetails>;
  claimIdempotency(input: RentalClaimIdempotencyData): Promise<IdempotencyClaim>;
  releaseIdempotency(shopId: string, scope: string, key: string, claimId: string): Promise<void>;
}

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
    charge?: {
      chargeType: string;
      amount: number;
      description?: string;
    };
  }>;
  manualCharges?: Array<{
    chargeType: string;
    amount: number;
    description?: string;
  }>;
  note?: string;
}

export interface SettleRentalOrderData {
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  shopId: string;
  orderId: string;
  actorMemberId: string;
  actorUserId: string;
  actorName: string;
  settlementType?: string;
  note?: string;
  returnDocument?: boolean;
  evidence?: {
    key: string;
    filename: string;
    mimeType: string;
    size: number;
  };
}

export interface ReturnPreviewData {
  dueAt: Date;
  actualReturnedAt: Date;
  lateDays: number;
  dailyLateFeePerSet: number;
  lateFee: string;
  additionalRental: string;
  itemCount: number;
  rentalSubtotal: string;
  depositHeld: string;
  collateralMethod: string;
  documentType: string | null;
}

export interface RentalGetBookableVariantData {
  shopId: string;
  variantId: string;
  durationDays: number;
  from: Date;
  until: Date;
}

export interface RentalListCriteria {
  shopId: string;
  customerId?: string;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  until?: Date;
}

export interface RentalTransitionData {
  shopId: string;
  orderId: string;
  fromStatuses: RentalStatus[];
  toStatus: RentalStatus;
  changedBy: string;
  reason?: string;
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

export interface RentalClaimIdempotencyData {
  shopId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}
