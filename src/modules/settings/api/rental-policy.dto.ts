import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { DepositDocumentType, DepositMethod } from '../domain/rental-policy';

export class CategoryDepositOverrideDto {
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111' })
  @IsString()
  categoryId!: string;

  @ApiProperty({ example: 300000, description: 'Cash deposit amount for this category in VND' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  cashAmount!: number;
}

export class RentalPricingPolicyDto {
  @ApiProperty({ example: 50000, description: 'Default rental price in VND' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  defaultRentalPrice!: number;
}

export class DepositPolicyDto {
  @ApiProperty({
    example: ['CASH', 'DOCUMENT'],
    enum: ['CASH', 'DOCUMENT'],
    isArray: true,
    description: 'Allowed deposit methods',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['CASH', 'DOCUMENT'], { each: true })
  allowedMethods!: DepositMethod[];

  @ApiProperty({
    example: ['CCCD', 'GPLX'],
    enum: ['CCCD', 'GPLX'],
    isArray: true,
    description: 'Allowed document types for document collateral',
  })
  @IsArray()
  @IsIn(['CCCD', 'GPLX'], { each: true })
  allowedDocumentTypes!: DepositDocumentType[];

  @ApiProperty({ example: 200000, description: 'Default cash deposit in VND' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  defaultCashDeposit!: number;

  @ApiPropertyOptional({
    type: [CategoryDepositOverrideDto],
    description: 'Optional category-specific cash deposit overrides',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDepositOverrideDto)
  categoryOverrides?: CategoryDepositOverrideDto[];
}

export class ReschedulePolicyDto {
  @ApiProperty({ example: 20, description: 'Maximum allowed reschedule days from booking' })
  @IsInt()
  @Min(1)
  @Max(365)
  maxDaysFromBooking!: number;
}

export class LateReturnPolicyDto {
  @ApiProperty({ example: 10000, description: 'Late fee per item per day in VND' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feePerItemPerDay!: number;

  @ApiProperty({
    example: 3,
    description: 'Day of late return when a new rental cycle charge is triggered',
  })
  @IsInt()
  @Min(1)
  @Max(30)
  newRentalChargeFromLateDay!: number;
}

export class SpecialCleaningPolicyDto {
  @ApiProperty({ example: 30000, description: 'Minimum special cleaning fee in VND' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feeMin!: number;

  @ApiProperty({ example: 50000, description: 'Maximum special cleaning fee in VND' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feeMax!: number;
}

export class LoyaltyPolicyDto {
  @ApiProperty({ example: true, description: 'Whether customer loyalty program is enabled' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    example: 5,
    description: 'Number of completed rentals required for reward',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  rentalsRequired!: number;

  @ApiProperty({ example: 50000, description: 'Free rental value reward in VND' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  rewardRentalValue!: number;

  @ApiProperty({
    example: false,
    description: 'Whether loyalty reward can be stacked with other promotions',
  })
  @IsBoolean()
  stackableWithPromotions!: boolean;
}

export class UpdateRentalPolicyReqDto {
  @ApiPropertyOptional({ type: RentalPricingPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RentalPricingPolicyDto)
  rentalPricing?: RentalPricingPolicyDto;

  @ApiPropertyOptional({ type: DepositPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DepositPolicyDto)
  deposit?: DepositPolicyDto;

  @ApiPropertyOptional({ type: ReschedulePolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReschedulePolicyDto)
  reschedule?: ReschedulePolicyDto;

  @ApiPropertyOptional({ type: LateReturnPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LateReturnPolicyDto)
  lateReturn?: LateReturnPolicyDto;

  @ApiPropertyOptional({ type: SpecialCleaningPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpecialCleaningPolicyDto)
  specialCleaning?: SpecialCleaningPolicyDto;

  @ApiPropertyOptional({ type: LoyaltyPolicyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoyaltyPolicyDto)
  loyalty?: LoyaltyPolicyDto;
}

export class RentalPolicyResDto {
  @ApiProperty({ type: RentalPricingPolicyDto })
  rentalPricing!: RentalPricingPolicyDto;

  @ApiProperty({ type: DepositPolicyDto })
  deposit!: DepositPolicyDto;

  @ApiProperty({ type: ReschedulePolicyDto })
  reschedule!: ReschedulePolicyDto;

  @ApiProperty({ type: LateReturnPolicyDto })
  lateReturn!: LateReturnPolicyDto;

  @ApiProperty({ type: SpecialCleaningPolicyDto })
  specialCleaning!: SpecialCleaningPolicyDto;

  @ApiProperty({ type: LoyaltyPolicyDto })
  loyalty!: LoyaltyPolicyDto;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;
}
