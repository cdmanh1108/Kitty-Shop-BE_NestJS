import { RentalConfirmationResDto } from '../../rental-confirmation.dto';
import { RentalCyclePricingResDto } from '../../rental-cycle-pricing.dto';
import { RENTAL_BILLING_ROLE } from '../../../domain/rental-accessories';
import { PRODUCT_KIND } from '@modules/catalog/public/product-kind';
import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import { ORDER_PAYMENT_STATUS } from '@modules/finance/public/payment-status';
import { WEB_PAYMENT_PREFERENCES } from '@modules/rentals/domain/web-payment-preference';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { RentalReturnResDto } from './rental-return.dto';
import { RentalSettlementDetailsResDto, RentalSettlementResDto } from './rental-settlement.dto';

export class RentalListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã khách hàng phải là UUID hợp lệ.' })
  @IsOptional()
  customerId?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
  @ApiPropertyOptional({ enum: Object.values(RENTAL_STATUS) })
  @IsIn(Object.values(RENTAL_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
  @ApiPropertyOptional({ enum: Object.values(ORDER_PAYMENT_STATUS) })
  @IsIn(Object.values(ORDER_PAYMENT_STATUS), { message: 'Trạng thái thanh toán không hợp lệ.' })
  @IsOptional()
  paymentStatus?: string;
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
}

export class RentalCustomerResDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
}

export class RentalItemSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() productNameSnapshot!: string;
  @ApiProperty() variantNameSnapshot!: string;
  @ApiProperty() quantity!: number;
}

export class RentalAllocationResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() operationalStatus!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) reservedFrom!: string;
  @ApiProperty({ format: 'date-time' }) reservedUntil!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) releasedAt!: string | null;
}

export class RentalItemResDto extends RentalItemSummaryResDto {
  @ApiProperty({ enum: Object.values(RENTAL_BILLING_ROLE) }) billingRole!: string;
  @ApiProperty({ enum: Object.values(PRODUCT_KIND) }) productKindSnapshot!: string;
  @ApiPropertyOptional({
    type: RentalCyclePricingResDto,
    description:
      'Biểu giá được chốt khi tạo đơn. Đơn cũ hoặc giá toàn kỳ tương thích không có trường này.',
  })
  pricing?: RentalCyclePricingResDto;
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl?: string | null;
  @ApiProperty({ type: String }) unitRentalPrice!: string;
  @ApiProperty({ type: String }) depositAmount!: string;
  @ApiProperty({ type: String }) lineTotal!: string;
  @ApiProperty({ type: [RentalAllocationResDto] }) allocations!: RentalAllocationResDto[];
}

export class RentalChargeResDto {
  @ApiPropertyOptional({ type: String, nullable: true }) inventoryItemId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) source?: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() chargeType!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() currency!: string;
}

export class RentalPaymentResDto {
  @ApiProperty() source!: string;
  @ApiProperty({ type: String, nullable: true }) createdBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() transactionNumber!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() purpose!: string;
  @ApiProperty() paymentMethod!: string;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ format: 'date-time' }) paidAt!: string;
}

export class RentalDeliveryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() method!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) scheduledAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientName!: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) addressLine!: string | null;
  @ApiProperty({ type: String }) shippingFee!: string;
}

export class RentalStatusHistoryResDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}

export class RentalOrderListItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty({ format: 'date-time' }) rentalStartAt!: string;
  @ApiProperty({ format: 'date-time' }) rentalEndAt!: string;
  @ApiProperty() status!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() depositStatus!: string;
  @ApiProperty({ type: String, example: '500000.00' }) grandTotal!: string;
  @ApiProperty({ type: RentalCustomerResDto }) customer!: RentalCustomerResDto;
  @ApiProperty() itemCount!: number;
  @ApiProperty() productCount!: number;
}

export class RentalOrderResDto extends RentalOrderListItemResDto {
  @ApiProperty({
    enum: WEB_PAYMENT_PREFERENCES,
    nullable: true,
    description:
      'Phương thức thanh toán khách mong muốn khi tạo đơn Web; không xác nhận đã thanh toán và không thay thế phương thức trên phiếu thu thực tế.',
  })
  preferredPaymentMethod!: (typeof WEB_PAYMENT_PREFERENCES)[number] | null;
  @ApiProperty({ type: () => RentalConfirmationResDto, nullable: true })
  confirmation!: RentalConfirmationResDto | null;
  @ApiProperty({ type: [RentalItemResDto] }) items!: RentalItemResDto[];
  @ApiProperty({ type: String, example: '450000.00' }) rentalSubtotal!: string;
  @ApiProperty({ type: String, example: '50000.00' }) chargesTotal!: string;
  @ApiProperty({ type: String, example: '0.00' }) discountTotal!: string;
  @ApiProperty({ type: String, example: '1000000.00' }) depositRequired!: string;
  @ApiProperty() collateralMethod!: string;
  @ApiProperty({ type: String, nullable: true }) documentType!: string | null;
  @ApiProperty() collateralStatus!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) collateralReceivedAt!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) collateralReturnedAt!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) actualReturnedAt!:
    | string
    | null;
  @ApiProperty({
    type: String,
    example: '250000.00',
    description:
      'Net completed, non-voided non-deposit payment amount: inbound payments less outbound refunds. Deposit movements are excluded.',
  })
  paidAmount!: string;
  @ApiProperty({ type: String, example: '250000.00' }) remainingAmount!: string;
  @ApiProperty({ type: () => RentalSettlementResDto }) settlement!: RentalSettlementResDto;
  @ApiProperty({ type: () => RentalReturnResDto, nullable: true })
  returnRecord!: RentalReturnResDto | null;
  @ApiProperty({ type: () => RentalSettlementDetailsResDto, nullable: true })
  settlementDetails!: RentalSettlementDetailsResDto | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) internalNote!: string | null;
  @ApiProperty({ type: [RentalChargeResDto] }) charges!: RentalChargeResDto[];
  @ApiProperty({ type: [RentalPaymentResDto] }) payments!: RentalPaymentResDto[];
  @ApiProperty({ type: [RentalDeliveryResDto] }) deliveries!: RentalDeliveryResDto[];
  @ApiProperty({ type: [RentalStatusHistoryResDto] }) statusHistory!: RentalStatusHistoryResDto[];
}

export class RentalOrderPageResDto {
  @ApiProperty({ type: [RentalOrderListItemResDto] }) items!: RentalOrderListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
