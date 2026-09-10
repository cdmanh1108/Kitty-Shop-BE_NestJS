import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeliveryReqDto {
  @ApiProperty({ enum: ['OUTBOUND', 'RETURN'] }) @IsIn(['OUTBOUND', 'RETURN']) direction!: string;
  @ApiProperty({ enum: ['CUSTOMER_PICKUP', 'SHOP_DELIVERY', 'THIRD_PARTY_SHIPPER'] }) @IsIn(['CUSTOMER_PICKUP', 'SHOP_DELIVERY', 'THIRD_PARTY_SHIPPER']) method!: string;
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
  @ApiPropertyOptional({ default: 0 }) @Type(() => Number) @IsNumber() @Min(0) @IsOptional() shippingFee = 0;
  @ApiPropertyOptional() @IsString() @IsOptional() trackingCode?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

export class UpdateDeliveryStatusReqDto {
  @ApiProperty({ enum: ['PENDING', 'READY', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED'] }) @IsIn(['PENDING', 'READY', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED']) status!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() shipperPhone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() trackingCode?: string;
}
