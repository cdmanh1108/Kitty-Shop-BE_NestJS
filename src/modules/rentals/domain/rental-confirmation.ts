import type { DecimalValue } from '@common/types/decimal';
import { RentalInvariantError } from './rental-errors';

export interface ConfirmRentalInput {
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  collateralAmount: number;
  note?: string;
}

export interface RentalConfirmationRecord {
  orderId: string;
  shopId: string;
  confirmedAt: Date;
  confirmedBy: string;
  actorUserId: string;
  actorName: string;
  rentalAmount: DecimalValue;
  collateralAmount: DecimalValue;
  note: string | null;
  evidenceKey: string | null;
  evidenceFilename: string | null;
  evidenceMimeType: string | null;
  evidenceSize: number | null;
}

export interface ConfirmRentalData extends ConfirmRentalInput {
  shopId: string;
  orderId: string;
  actorMemberId: string;
  actorUserId: string;
  actorName: string;
  requestId?: string;
  evidence?: { key: string; filename: string; mimeType: string; size: number };
}

export function assertManualConfirmation(input: ConfirmRentalInput): void {
  if (
    input.collateralAmount === undefined ||
    !Number.isFinite(input.collateralAmount) ||
    input.collateralAmount < 0 ||
    input.collateralAmount > 100_000_000 ||
    !Number.isSafeInteger(Math.round(input.collateralAmount * 100)) ||
    Math.abs(input.collateralAmount * 100 - Math.round(input.collateralAmount * 100)) > 0.000001
  )
    throw new RentalInvariantError(
      'INVALID_COLLATERAL_AMOUNT',
      'Tiền cọc phải từ 0 đến 100.000.000 và có tối đa 2 chữ số thập phân.',
    );
}
