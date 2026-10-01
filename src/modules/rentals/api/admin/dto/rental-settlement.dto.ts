import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SettleRentalOrderReqDto {
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
  returnDocumentCollateral?: boolean;
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
