import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import {
  PAYMENT_STATUS,
  type PaymentStatus,
  type PaymentSummary,
} from '@modules/payments/public/payment-service';

export class PayosCapabilityDto {
  @ApiProperty() enabled!: boolean;
}

export class PayosPaymentDto {
  @ApiProperty({ enum: PAYMENT_STATUS }) status!: PaymentStatus;
  @ApiProperty({ type: String, nullable: true }) checkoutUrl!: string | null;
  @ApiProperty() canOpen!: boolean;
  @ApiProperty() rentalAmount!: number;
  @ApiProperty() depositAmount!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: string | null;
}

export function toPayosPayment({
  chargeAmount,
  ...payment
}: PaymentSummary): PayosPaymentDto {
  return { ...payment, rentalAmount: chargeAmount };
}

export class PayosReviewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) orderCode!: string | null;
  @ApiProperty() amount!: number;
  @ApiProperty() reference!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) paidAt!: string;
}

export class PayosRefundReqDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9._:/-]+$/, { message: 'Nhập mã giao dịch hoàn tiền từ ngân hàng.' })
  refundReference!: string;
}
