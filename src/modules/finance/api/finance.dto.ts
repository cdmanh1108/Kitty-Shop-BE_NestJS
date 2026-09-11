import {
  type PaymentDirection,
  type PaymentPurpose,
  type PaymentMethod,
  PAYMENT_DIRECTION,
  PAYMENT_PURPOSE,
  PAYMENT_METHOD,
} from '@modules/finance/domain/payment-types';

import { EXPENSE_STATUS } from '@modules/finance/domain/payment-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class CreatePaymentReqDto {
  @ApiProperty({ enum: Object.values(PAYMENT_DIRECTION), default: 'IN' })
  @IsIn(Object.values(PAYMENT_DIRECTION))
  direction: PaymentDirection = 'IN';
  @ApiProperty({ enum: Object.values(PAYMENT_PURPOSE), example: 'RENTAL_PAYMENT' })
  @IsIn(Object.values(PAYMENT_PURPOSE))
  purpose!: PaymentPurpose;
  @ApiProperty({ enum: Object.values(PAYMENT_METHOD), example: 'BANK_TRANSFER' })
  @IsIn(Object.values(PAYMENT_METHOD))
  paymentMethod!: PaymentMethod;
  @ApiProperty({ example: 500000 }) @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @ApiPropertyOptional() @IsString() @IsOptional() externalReference?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bankReference?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() paidAt?: string;
}

export class PaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() orderId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() until?: string;
  @ApiPropertyOptional({ enum: Object.values(PAYMENT_PURPOSE) })
  @IsIn(Object.values(PAYMENT_PURPOSE))
  @IsOptional()
  purpose?: string;
}

export class CreateExpenseReqDto {
  @ApiProperty() @IsUUID() categoryId!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() orderId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() inventoryItemId?: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty({ example: 120000 }) @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentMethod?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() vendorName?: string;
  @ApiProperty({ example: '2026-09-10' }) @IsDateString() expenseDate!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() paidAt?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() receiptUrl?: string;
}

export class ExpenseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() until?: string;
  @ApiPropertyOptional({ enum: Object.values(EXPENSE_STATUS) })
  @IsIn(Object.values(EXPENSE_STATUS))
  @IsOptional()
  status?: string;
}

export class PaymentResDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() transactionNumber!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty({ type: String, example: '500000.00' }) amount!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) paidAt!: string;
}

export class ExpenseResDto {
  @ApiProperty() id!: string;
  @ApiProperty() expenseNumber!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, example: '120000.00' }) amount!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date' }) expenseDate!: string;
}

export class PaymentPageResDto {
  @ApiProperty({ type: [PaymentResDto] }) items!: PaymentResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}

export class ExpensePageResDto {
  @ApiProperty({ type: [ExpenseResDto] }) items!: ExpenseResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
