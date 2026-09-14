import type {
  DepositDocumentType,
  DepositMethod,
  RentalPolicy,
} from '@modules/settings/domain/rental-policy';
import type { DecimalValue } from '@common/types/decimal';
import { RentalInvariantError } from './rental-errors';

export interface ConfirmRentalInput {
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  collateralMethod: DepositMethod;
  documentType?: DepositDocumentType;
  collateralAmount?: number;
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
  collateralMethod: string;
  documentType: string | null;
  collateralAmount: DecimalValue | null;
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

export function assertManualConfirmation(input: ConfirmRentalInput, policy: RentalPolicy): void {
  if (!policy.deposit.allowedMethods.includes(input.collateralMethod))
    throw new RentalInvariantError(
      'COLLATERAL_METHOD_NOT_ALLOWED',
      'Phương thức đặt cọc không được chính sách cửa hàng cho phép.',
    );
  if (input.collateralMethod === 'CASH') {
    if (input.documentType !== undefined)
      throw new RentalInvariantError(
        'INVALID_COLLATERAL',
        'Đặt cọc tiền mặt không được kèm loại giấy tờ.',
      );
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
  } else if (input.collateralMethod === 'DOCUMENT') {
    if (!input.documentType || !policy.deposit.allowedDocumentTypes.includes(input.documentType))
      throw new RentalInvariantError(
        'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED',
        'Loại giấy tờ đặt cọc không được chính sách cửa hàng cho phép.',
      );
    if (input.collateralAmount !== undefined)
      throw new RentalInvariantError(
        'INVALID_COLLATERAL',
        'Đặt cọc giấy tờ không được kèm số tiền cọc.',
      );
  } else {
    throw new RentalInvariantError('INVALID_COLLATERAL', 'Phương thức đặt cọc không hợp lệ.');
  }
}
