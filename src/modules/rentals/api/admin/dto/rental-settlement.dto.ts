import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  ValidateIf,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { RentalItemFeeOverrideReqDto } from './rental-return.dto';

export class SettlementItemFeeOverrideReqDto extends RentalItemFeeOverrideReqDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Mã món đồ phải là UUID hợp lệ.' })
  inventoryItemId!: string;
}

export class SettlementPreviewReqDto {
  @ApiPropertyOptional({ type: [SettlementItemFeeOverrideReqDto] })
  @ValidateIf((_: SettlementPreviewReqDto, value: unknown) => value !== undefined)
  @IsArray({ message: 'Danh sách ghi đè phí phải là danh sách.' })
  @ValidateNested({ each: true, message: 'Thông tin ghi đè phí từng món không hợp lệ.' })
  @Type(() => SettlementItemFeeOverrideReqDto)
  feeOverrides?: SettlementItemFeeOverrideReqDto[];
}

function parseFeeOverrides(value: unknown): unknown {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  return Array.isArray(parsed)
    ? parsed.map((item: unknown) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? plainToInstance(SettlementItemFeeOverrideReqDto, item)
          : item,
      )
    : parsed;
}

export class SettleRentalOrderReqDto {
  @ApiPropertyOptional({
    type: [SettlementItemFeeOverrideReqDto],
    description: 'Trong multipart, gửi chuỗi JSON của danh sách {inventoryItemId, amount, reason}.',
  })
  @Transform(({ value }: { value: unknown }) => parseFeeOverrides(value), { toClassOnly: true })
  @ValidateIf((_: SettleRentalOrderReqDto, value: unknown) => value !== undefined)
  @IsArray({ message: 'Danh sách ghi đè phí phải là danh sách hoặc chuỗi JSON hợp lệ.' })
  @ValidateNested({ each: true, message: 'Thông tin ghi đè phí từng món không hợp lệ.' })
  @Type(() => SettlementItemFeeOverrideReqDto)
  feeOverrides?: SettlementItemFeeOverrideReqDto[];

  @ApiPropertyOptional({ description: 'Mã từ settlement-preview; bắt buộc khi ghi đè phí.' })
  @ValidateIf((_: SettleRentalOrderReqDto, value: unknown) => value !== undefined)
  @Matches(/^[a-f0-9]{64}$/, { message: 'Mã đối chiếu tất toán không hợp lệ.' })
  feePreviewToken?: string;
  @ApiPropertyOptional({ enum: ['CASH', 'BANK_TRANSFER'] })
  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'], { message: 'Phương thức thanh toán không hợp lệ.' })
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  @ApiPropertyOptional({ example: 'Đã hoàn cọc qua tiền mặt' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    description: 'Xác nhận đã trả lại giấy tờ CCCD/GPLX cho khách (nếu đơn giữ giấy tờ)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'Xác nhận trả giấy tờ phải là giá trị đúng hoặc sai.' })
  returnDocumentCollateral?: boolean;
}

export class SettlementPreviewItemResDto {
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() billingRole!: string;
  @ApiProperty() canOverride!: boolean;
  @ApiProperty({ type: String, nullable: true }) calculatedFee!: string | null;
  @ApiProperty({ type: String, nullable: true }) currentFee!: string | null;
  @ApiProperty({ type: String, nullable: true }) agreedFee!: string | null;
  @ApiProperty({ type: String, nullable: true }) feeOverrideReason!: string | null;
}

export class SettlementPreviewResDto {
  @ApiProperty() feePreviewToken!: string;
  @ApiProperty({ type: String }) grandTotal!: string;
  @ApiProperty({ type: String }) totalCharges!: string;
  @ApiProperty({ type: String }) depositReceived!: string;
  @ApiProperty({ type: String }) depositAvailable!: string;
  @ApiProperty({ type: String }) refundAmount!: string;
  @ApiProperty({ type: String }) amountDue!: string;
  @ApiProperty({ type: [SettlementPreviewItemResDto] }) items!: SettlementPreviewItemResDto[];
}

export class RentalSettlementDetailsResDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({ format: 'date-time' }) settledAt!: string;
  @ApiProperty() settledBy!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ enum: ['REFUND', 'COLLECTION', 'BALANCED', 'COLLATERAL_ONLY'] })
  settlementType!: string;
  @ApiProperty({ type: String, example: '0.00' }) amount!: string;
  @ApiProperty({ type: String, example: '300000.00' }) depositAmount!: string;
  @ApiProperty({ type: String, example: '70000.00' }) totalCharges!: string;
  @ApiProperty({ type: String, example: '230000.00' }) refundAmount!: string;
  @ApiProperty({ type: String, example: '0.00' }) amountDue!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceKey!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceFilename!: string | null;
  @ApiProperty({ type: String, nullable: true }) evidenceMimeType!: string | null;
  @ApiProperty({ type: Number, nullable: true }) evidenceSize!: number | null;
}

export class RentalSettlementResDto {
  @ApiProperty({ type: String }) depositAvailable!: string;
  @ApiProperty({ type: String }) depositReceived!: string;
  @ApiProperty({ type: String }) refundAmount!: string;
  @ApiProperty({ type: String }) amountStillDue!: string;
  @ApiProperty({ enum: ['PENDING', 'REFUND_DUE', 'AMOUNT_DUE', 'BALANCED', 'SETTLED'] })
  settlementStatus!: string;
}
