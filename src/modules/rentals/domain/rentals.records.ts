import type { DecimalValue } from '@common/types/decimal';
import type { JsonValue } from '@common/types/json';

export interface RentalItemAllocationRecord {
  id: string;
  shopId: string;
  orderId: string;
  orderItemId: string;
  inventoryItemId: string;
  reservedFrom: Date;
  reservedUntil: Date;
  status: string;
  allocatedAt: Date;
  releasedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalOrderRecord {
  id: string;
  shopId: string;
  orderNumber: string;
  customerId: string;
  locationId: string | null;
  rentalStartAt: Date;
  rentalEndAt: Date;
  actualStartedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  status: string;
  paymentStatus: string;
  depositStatus: string;
  currency: string;
  rentalSubtotal: DecimalValue;
  chargesTotal: DecimalValue;
  discountTotal: DecimalValue;
  depositRequired: DecimalValue;
  grandTotal: DecimalValue;
  note: string | null;
  internalNote: string | null;
  metadata: JsonValue | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalOrderStatusHistoryRecord {
  id: string;
  shopId: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  note: string | null;
  changedBy: string | null;
  changedAt: Date;
}

export interface RentalOrderItemRecord {
  id: string;
  shopId: string;
  orderId: string;
  productId: string;
  variantId: string;
  quantity: number;
  rentalStartAt: Date;
  rentalEndAt: Date;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  skuSnapshot: string | null;
  unitRentalPrice: DecimalValue;
  depositAmount: DecimalValue;
  discountAmount: DecimalValue;
  lineTotal: DecimalValue;
  pricingSnapshot: JsonValue | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalOrderChargeRecord {
  id: string;
  shopId: string;
  orderId: string;
  orderItemId: string | null;
  chargeType: string;
  description: string | null;
  amount: DecimalValue;
  currency: string;
  quantity: number;
  metadata: JsonValue | null;
  createdBy: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
}
