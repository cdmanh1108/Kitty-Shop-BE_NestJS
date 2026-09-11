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
  @ApiProperty({ default: 1, minimum: 1, maximum: 20 })
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
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @IsOptional() quantity =
    1;
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
  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingFee = 0;
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
  @ApiPropertyOptional({ default: 0 })
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
}

export class RentalListQueryDto extends PaginationQueryDto {
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
  @ApiProperty({ type: Object }) customer!: object;
  @ApiProperty({ type: [Object] }) items!: object[];
}

export class RentalOrderResDto extends RentalOrderListItemResDto {
  @ApiProperty({ type: String, example: '450000.00' }) rentalSubtotal!: string;
  @ApiProperty({ type: String, example: '50000.00' }) chargesTotal!: string;
  @ApiProperty({ type: String, example: '0.00' }) discountTotal!: string;
  @ApiProperty({ type: String, example: '1000000.00' }) depositRequired!: string;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
  @ApiPropertyOptional({ nullable: true }) internalNote!: string | null;
  @ApiProperty({ type: [Object] }) charges!: object[];
  @ApiProperty({ type: [Object] }) payments!: object[];
  @ApiProperty({ type: [Object] }) deliveries!: object[];
  @ApiProperty({ type: [Object] }) statusHistory!: object[];
}

export class RentalOrderPageResDto {
  @ApiProperty({ type: [RentalOrderListItemResDto] }) items!: RentalOrderListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
