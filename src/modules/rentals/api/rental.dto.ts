import { CHARGE_TYPE } from '@modules/rentals/domain/charge-type';
import { DELIVERY_DIRECTION, DELIVERY_METHOD } from '@modules/deliveries/domain/delivery-status';

import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import { ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class CreateRentalItemReqDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ type: Number, default: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity = 1;
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional physical item selection; otherwise backend auto-allocates.',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  inventoryItemIds?: string[];
}

export class RentalChargeReqDto {
  @ApiProperty({ enum: Object.values(CHARGE_TYPE), example: 'ACCESSORY' })
  @IsIn(Object.values(CHARGE_TYPE))
  chargeType!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty({ example: 50000 }) @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity = 1;
}

export class RentalDeliveryReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION), default: 'OUTBOUND' })
  @IsIn(Object.values(DELIVERY_DIRECTION))
  direction = 'OUTBOUND';
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD))
  method!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() scheduledAt?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() recipientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() recipientPhone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() addressLine?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() ward?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() province?: string;
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingFee = 0;
}

export class RentalCollateralReqDto {
  @ApiProperty({ enum: ['CASH', 'DOCUMENT'] }) @IsIn(['CASH', 'DOCUMENT']) method!:
    | 'CASH'
    | 'DOCUMENT';
  @ApiPropertyOptional({ enum: ['CCCD', 'GPLX'] })
  @IsIn(['CCCD', 'GPLX'])
  @IsOptional()
  documentType?: 'CCCD' | 'GPLX';
}

export class CreateRentalOrderReqDto {
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() locationId?: string;
  @ApiProperty({ example: '2026-09-12T03:00:00.000Z' }) @IsDateString() rentalStartAt!: string;
  @ApiProperty({ example: '2026-09-14T03:00:00.000Z' }) @IsDateString() rentalEndAt!: string;
  @ApiProperty({ type: [CreateRentalItemReqDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRentalItemReqDto)
  items!: CreateRentalItemReqDto[];
  @ApiPropertyOptional({ type: [RentalChargeReqDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RentalChargeReqDto)
  @IsOptional()
  charges: RentalChargeReqDto[] = [];
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountTotal = 0;
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() internalNote?: string;
  @ApiPropertyOptional({ type: RentalDeliveryReqDto })
  @ValidateNested()
  @Type(() => RentalDeliveryReqDto)
  @IsOptional()
  delivery?: RentalDeliveryReqDto;
  @ApiPropertyOptional({ type: () => RentalCollateralReqDto })
  @ValidateNested()
  @Type(() => RentalCollateralReqDto)
  @IsOptional()
  collateral?: RentalCollateralReqDto;
}

export class RentalListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() customerId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional({ enum: Object.values(RENTAL_STATUS) })
  @IsIn(Object.values(RENTAL_STATUS))
  @IsOptional()
  status?: string;
  @ApiPropertyOptional({ enum: Object.values(ORDER_PAYMENT_STATUS) })
  @IsIn(Object.values(ORDER_PAYMENT_STATUS))
  @IsOptional()
  paymentStatus?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() until?: string;
}

export class TransitionRentalReqDto {
  @ApiPropertyOptional() @IsString() @IsOptional() reason?: string;
}

export class RescheduleRentalReqDto {
  @ApiProperty() @IsDateString() rentalStartAt!: string;
  @ApiProperty() @IsDateString() rentalEndAt!: string;
}

export class AddRentalChargeReqDto extends RentalChargeReqDto {}

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
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String }) unitRentalPrice!: string;
  @ApiProperty({ type: String }) depositAmount!: string;
  @ApiProperty({ type: String }) lineTotal!: string;
  @ApiProperty({ type: [RentalAllocationResDto] }) allocations!: RentalAllocationResDto[];
}

export class RentalChargeResDto {
  @ApiProperty() id!: string;
  @ApiProperty() chargeType!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() currency!: string;
}

export class RentalPaymentResDto {
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
  @ApiProperty({ type: [RentalItemSummaryResDto] }) items!: RentalItemSummaryResDto[];
}

export class RentalSettlementResDto {
  @ApiProperty({ type: String }) depositReceived!: string;
  @ApiProperty({ type: String }) refundAmount!: string;
  @ApiProperty({ type: String }) amountStillDue!: string;
  @ApiProperty({ enum: ['PENDING', 'REFUND_DUE', 'AMOUNT_DUE', 'BALANCED'] })
  settlementStatus!: string;
}

export class RentalOrderResDto extends RentalOrderListItemResDto {
  @ApiProperty({ type: [RentalItemResDto] }) declare items: RentalItemResDto[];
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
  @ApiProperty({ type: String, example: '250000.00' }) paidAmount!: string;
  @ApiProperty({ type: String, example: '250000.00' }) remainingAmount!: string;
  @ApiProperty({ type: () => RentalSettlementResDto }) settlement!: RentalSettlementResDto;
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
