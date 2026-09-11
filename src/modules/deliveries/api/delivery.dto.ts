import {
  type DeliveryDirection,
  type DeliveryMethod,
  type DeliveryStatus,
  DELIVERY_DIRECTION,
  DELIVERY_METHOD,
  DELIVERY_STATUS,
} from '@modules/deliveries/domain/delivery-status';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeliveryReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION) })
  @IsIn(Object.values(DELIVERY_DIRECTION))
  direction!: DeliveryDirection;
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD))
  method!: DeliveryMethod;
  @ApiPropertyOptional() @IsDateString() @IsOptional() scheduledAt?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() recipientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() recipientPhone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() addressLine?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() ward?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() province?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperPhone?: string;
  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingFee = 0;
  @ApiPropertyOptional() @IsString() @IsOptional() trackingCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class UpdateDeliveryStatusReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_STATUS) })
  @IsIn(Object.values(DELIVERY_STATUS))
  status!: DeliveryStatus;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperPhone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() trackingCode?: string;
}
