import { INVENTORY_STATUS, type InventoryStatus } from '@modules/catalog/domain/catalog-status';
import { RentalInvariantError } from './rental-errors';

export const ITEM_INSPECTION_CONDITION = {
  NORMAL: 'NORMAL',
  CLEANING_REQUIRED: 'CLEANING_REQUIRED',
  REPAIR_REQUIRED: 'REPAIR_REQUIRED',
  DAMAGED: 'DAMAGED',
  LOST: 'LOST',
} as const;
export type ItemInspectionCondition =
  (typeof ITEM_INSPECTION_CONDITION)[keyof typeof ITEM_INSPECTION_CONDITION];

export const INSPECTION_TO_INVENTORY_STATUS: Record<ItemInspectionCondition, InventoryStatus> = {
  NORMAL: INVENTORY_STATUS.AVAILABLE,
  CLEANING_REQUIRED: INVENTORY_STATUS.CLEANING,
  REPAIR_REQUIRED: INVENTORY_STATUS.REPAIRING,
  DAMAGED: INVENTORY_STATUS.DAMAGED,
  LOST: INVENTORY_STATUS.LOST,
};

export const SETTLEMENT_TYPE = {
  REFUND: 'REFUND',
  PAYMENT: 'PAYMENT',
  BALANCED: 'BALANCED',
} as const;
export type SettlementType = (typeof SETTLEMENT_TYPE)[keyof typeof SETTLEMENT_TYPE];

export interface ReceiveReturnItemInput {
  inventoryItemId: string;
  condition: ItemInspectionCondition;
  note?: string;
  charge?: {
    chargeType: string;
    amount: number;
    description?: string;
  };
}

export interface ReceiveReturnManualChargeInput {
  chargeType: string;
  amount: number;
  description?: string;
}

export interface ReceiveRentalReturnInput {
  orderId: string;
  actualReturnedAt?: Date;
  items: ReceiveReturnItemInput[];
  manualCharges?: ReceiveReturnManualChargeInput[];
  note?: string;
}

export interface SettleRentalOrderInput {
  orderId: string;
  settlementType: SettlementType;
  note?: string;
  returnDocument?: boolean;
}

export interface RentalReturnInspectionRecord {
  id: string;
  orderId: string;
  inventoryItemId: string;
  condition: string;
  note: string | null;
  createdAt: Date;
}

import type { DecimalValue } from '@common/types/decimal';

export interface RentalReturnRecord {
  orderId: string;
  shopId: string;
  returnedAt: Date;
  receivedBy: string;
  actorUserId: string;
  actorName: string;
  lateDays: number;
  lateFee: DecimalValue;
  additionalRental: DecimalValue;
  note: string | null;
  createdAt: Date;
  inspections: RentalReturnInspectionRecord[];
}

export interface RentalSettlementRecord {
  orderId: string;
  shopId: string;
  settledAt: Date;
  settledBy: string;
  actorUserId: string;
  actorName: string;
  settlementType: string;
  amount: DecimalValue;
  depositAmount: DecimalValue;
  totalCharges: DecimalValue;
  refundAmount: DecimalValue;
  amountDue: DecimalValue;
  note: string | null;
  evidenceKey: string | null;
  evidenceFilename: string | null;
  evidenceMimeType: string | null;
  evidenceSize: number | null;
  createdAt: Date;
}

export function assertReturnInspection(input: {
  allocatedInventoryIds: string[];
  inspectionItems: ReceiveReturnItemInput[];
}): void {
  const allocatedSet = new Set(input.allocatedInventoryIds);
  if (input.inspectionItems.length !== allocatedSet.size) {
    throw new RentalInvariantError(
      'INSPECTION_ITEMS_COUNT_MISMATCH',
      'Phải kiểm tra đầy đủ tất cả món đồ trong đơn thuê.',
    );
  }
  const inspectedSet = new Set<string>();
  for (const item of input.inspectionItems) {
    if (!allocatedSet.has(item.inventoryItemId)) {
      throw new RentalInvariantError(
        'UNKNOWN_INSPECTION_ITEM',
        `Món đồ ${item.inventoryItemId} không thuộc đơn thuê này.`,
      );
    }
    if (inspectedSet.has(item.inventoryItemId)) {
      throw new RentalInvariantError(
        'DUPLICATE_INSPECTION_ITEM',
        `Món đồ ${item.inventoryItemId} bị kiểm tra trùng lặp.`,
      );
    }
    inspectedSet.add(item.inventoryItemId);
    if (!Object.values(ITEM_INSPECTION_CONDITION).includes(item.condition)) {
      throw new RentalInvariantError(
        'INVALID_INSPECTION_CONDITION',
        `Tình trạng kiểm tra ${item.condition} không hợp lệ.`,
      );
    }
    if (item.charge) {
      if (!Number.isFinite(item.charge.amount) || item.charge.amount < 0) {
        throw new RentalInvariantError(
          'INVALID_CHARGE_AMOUNT',
          'Số tiền phụ thu phải lớn hơn hoặc bằng 0.',
        );
      }
      if (!Number.isInteger(item.charge.amount)) {
        throw new RentalInvariantError(
          'INVALID_CHARGE_CURRENCY',
          'Số tiền phụ thu VND phải là số nguyên.',
        );
      }
    }
  }
}
