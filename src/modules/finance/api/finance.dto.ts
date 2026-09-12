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
  @IsIn(Object.values(PAYMENT_DIRECTION), { message: 'Chiều giao dịch không hợp lệ.' })
  direction: PaymentDirection = 'IN';
  @ApiProperty({ enum: Object.values(PAYMENT_PURPOSE), example: 'RENTAL_PAYMENT' })
  @IsIn(Object.values(PAYMENT_PURPOSE), { message: 'Mục đích thanh toán không hợp lệ.' })
  purpose!: PaymentPurpose;
  @ApiProperty({ enum: Object.values(PAYMENT_METHOD), example: 'BANK_TRANSFER' })
  @IsIn(Object.values(PAYMENT_METHOD), { message: 'Phương thức thanh toán không hợp lệ.' })
  paymentMethod!: PaymentMethod;
  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Số tiền phải là số hợp lệ.' })
  @Min(0.01, { message: 'Số tiền phải lớn hơn hoặc bằng $constraint1.' })
  amount!: number;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã tham chiếu bên ngoài phải là chuỗi ký tự.' })
  @IsOptional()
  externalReference?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã tham chiếu ngân hàng phải là chuỗi ký tự.' })
  @IsOptional()
  bankReference?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian thanh toán phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  paidAt?: string;
}

export class PaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã đơn thuê phải là UUID hợp lệ.' })
  @IsOptional()
  orderId?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  from?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  until?: string;
  @ApiPropertyOptional({ enum: Object.values(PAYMENT_PURPOSE) })
  @IsIn(Object.values(PAYMENT_PURPOSE), { message: 'Mục đích thanh toán không hợp lệ.' })
  @IsOptional()
  purpose?: string;
}

export class CreateExpenseReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  categoryId!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã đơn thuê phải là UUID hợp lệ.' })
  @IsOptional()
  orderId?: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã món đồ phải là UUID hợp lệ.' })
  @IsOptional()
  inventoryItemId?: string;
  @ApiProperty() @IsString({ message: 'Mô tả phải là chuỗi ký tự.' }) description!: string;
  @ApiProperty({ example: 120000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Số tiền phải là số hợp lệ.' })
  @Min(0.01, { message: 'Số tiền phải lớn hơn hoặc bằng $constraint1.' })
  amount!: number;
  @ApiPropertyOptional()
  @IsString({ message: 'Phương thức thanh toán phải là chuỗi ký tự.' })
  @IsOptional()
  paymentMethod?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên nhà cung cấp phải là chuỗi ký tự.' })
  @IsOptional()
  vendorName?: string;
  @ApiProperty({ example: '2026-09-10' })
  @IsDateString(undefined, { message: 'Ngày chi phải là ngày giờ hợp lệ theo định dạng ISO 8601.' })
  expenseDate!: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian thanh toán phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  paidAt?: string;
  @ApiPropertyOptional()
  @IsUrl(undefined, { message: 'Liên kết chứng từ phải là URL hợp lệ.' })
  @IsOptional()
  receiptUrl?: string;
}

export class ExpenseListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã danh mục phải là UUID hợp lệ.' })
  @IsOptional()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  from?: string;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  until?: string;
  @ApiPropertyOptional({ enum: Object.values(EXPENSE_STATUS) })
  @IsIn(Object.values(EXPENSE_STATUS), { message: 'Trạng thái không hợp lệ.' })
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
