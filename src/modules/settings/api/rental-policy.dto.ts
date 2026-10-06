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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { DepositDocumentType, DepositMethod } from '../domain/rental-policy';
import { RENTAL_PRICING_LIMITS } from '../domain/rental-pricing-policy';

export class CategoryDepositOverrideDto {
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111' })
  @IsString({ message: 'Mã danh mục phải là chuỗi ký tự.' })
  categoryId!: string;

  @ApiProperty({ example: 300000, description: 'Cash deposit amount for this category in VND' })
  @IsInt({ message: 'Tiền cọc phải là số nguyên.' })
  @Min(0, { message: 'Tiền cọc phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100_000_000, { message: 'Tiền cọc phải nhỏ hơn hoặc bằng $constraint1.' })
  cashAmount!: number;
}

export class RentalPricingPolicyDto {
  @ApiProperty({
    example: 50000,
    minimum: 0,
    maximum: RENTAL_PRICING_LIMITS.maxAmount,
    description: 'Giá một lượt thuê mặc định (VND); cũng áp dụng tại mỗi mốc lượt mới',
  })
  defaultRentalPrice!: number;

  @ApiProperty({
    example: 10000,
    minimum: 0,
    maximum: RENTAL_PRICING_LIMITS.maxAmount,
    description: 'Phụ phí mỗi ngày tiếp theo (VND), trừ ngày bắt đầu lượt mới',
  })
  additionalDayFee!: number;

  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: RENTAL_PRICING_LIMITS.maxQuantityThreshold,
    description: 'Tổng số món thuê thông thường để hưởng chu kỳ dài; không gồm phụ kiện miễn phí',
  })
  bulkQuantityThreshold!: number;

  @ApiProperty({
    example: 5,
    minimum: 2,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description:
      'Ngày bắt đầu lượt tiếp theo của đơn dưới ngưỡng; 5 tương ứng các mốc 1, 5, 9, 13...',
  })
  standardRenewalDay!: number;

  @ApiProperty({
    example: 8,
    minimum: 2,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description:
      'Ngày bắt đầu lượt tiếp theo của đơn đạt ngưỡng; 8 tương ứng các mốc 1, 8, 15, 22...',
  })
  bulkRenewalDay!: number;

  @ApiProperty({
    example: 9,
    minimum: 1,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description: 'Số ngày thuê tối đa được đặt qua website; không giới hạn đơn tạo trên admin',
  })
  maxOnlineRentalDays!: number;
}

/** All fields are optional and have no DTO defaults, so PATCH preserves stored values. */
export class UpdateRentalPricingPolicyDto {
  @ApiPropertyOptional({
    example: 50000,
    minimum: 0,
    maximum: RENTAL_PRICING_LIMITS.maxAmount,
    description: 'Giá một lượt thuê mặc định (VND)',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Giá một lượt thuê phải là số nguyên.' })
  @Min(0, { message: 'Giá một lượt thuê không được âm.' })
  @Max(RENTAL_PRICING_LIMITS.maxAmount, {
    message: 'Giá một lượt thuê không được vượt quá 100.000.000đ.',
  })
  defaultRentalPrice?: number;

  @ApiPropertyOptional({
    example: 10000,
    minimum: 0,
    maximum: RENTAL_PRICING_LIMITS.maxAmount,
    description: 'Phụ phí mỗi ngày tiếp theo (VND)',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Phụ phí mỗi ngày tiếp theo phải là số nguyên.' })
  @Min(0, { message: 'Phụ phí mỗi ngày tiếp theo không được âm.' })
  @Max(RENTAL_PRICING_LIMITS.maxAmount, {
    message: 'Phụ phí mỗi ngày tiếp theo không được vượt quá 100.000.000đ.',
  })
  additionalDayFee?: number;

  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    maximum: RENTAL_PRICING_LIMITS.maxQuantityThreshold,
    description: 'Ngưỡng số món thuê thông thường hưởng chu kỳ dài',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Ngưỡng số món hưởng chu kỳ dài phải là số nguyên.' })
  @Min(1, { message: 'Ngưỡng số món hưởng chu kỳ dài phải ít nhất là 1.' })
  @Max(RENTAL_PRICING_LIMITS.maxQuantityThreshold, {
    message: 'Ngưỡng số món hưởng chu kỳ dài không được vượt quá 1.000.',
  })
  bulkQuantityThreshold?: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 2,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description: 'Ngày bắt đầu lượt tiếp theo của đơn dưới ngưỡng',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Mốc lượt mới cho đơn dưới ngưỡng phải là số nguyên.' })
  @Min(2, { message: 'Mốc lượt mới cho đơn dưới ngưỡng phải từ ngày thứ 2 trở lên.' })
  @Max(RENTAL_PRICING_LIMITS.maxDays, {
    message: 'Mốc lượt mới cho đơn dưới ngưỡng không được vượt quá ngày thứ 365.',
  })
  standardRenewalDay?: number;

  @ApiPropertyOptional({
    example: 8,
    minimum: 2,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description: 'Ngày bắt đầu lượt tiếp theo của đơn đạt ngưỡng',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Mốc lượt mới cho đơn đạt ngưỡng phải là số nguyên.' })
  @Min(2, { message: 'Mốc lượt mới cho đơn đạt ngưỡng phải từ ngày thứ 2 trở lên.' })
  @Max(RENTAL_PRICING_LIMITS.maxDays, {
    message: 'Mốc lượt mới cho đơn đạt ngưỡng không được vượt quá ngày thứ 365.',
  })
  bulkRenewalDay?: number;

  @ApiPropertyOptional({
    example: 9,
    minimum: 1,
    maximum: RENTAL_PRICING_LIMITS.maxDays,
    description: 'Số ngày thuê tối đa đặt qua website',
  })
  @ValidateIf((_: UpdateRentalPricingPolicyDto, value: unknown) => value !== undefined)
  @IsInt({ message: 'Số ngày tối đa đặt qua website phải là số nguyên.' })
  @Min(1, { message: 'Số ngày tối đa đặt qua website phải ít nhất là 1.' })
  @Max(RENTAL_PRICING_LIMITS.maxDays, {
    message: 'Số ngày tối đa đặt qua website không được vượt quá 365.',
  })
  maxOnlineRentalDays?: number;
}

export class DepositPolicyDto {
  @ApiProperty({
    example: ['CASH', 'DOCUMENT'],
    enum: ['CASH', 'DOCUMENT'],
    isArray: true,
    description: 'Allowed deposit methods',
  })
  @IsArray({ message: 'Danh sách phương thức đặt cọc phải là danh sách.' })
  @ArrayNotEmpty({ message: 'Danh sách phương thức đặt cọc không được để trống.' })
  @IsIn(['CASH', 'DOCUMENT'], {
    each: true,
    message: 'Danh sách phương thức đặt cọc không hợp lệ.',
  })
  allowedMethods!: DepositMethod[];

  @ApiProperty({
    example: ['CCCD', 'GPLX'],
    enum: ['CCCD', 'GPLX'],
    isArray: true,
    description: 'Allowed document types for document collateral',
  })
  @IsArray({ message: 'Danh sách loại giấy tờ phải là danh sách.' })
  @IsIn(['CCCD', 'GPLX'], { each: true, message: 'Danh sách loại giấy tờ không hợp lệ.' })
  allowedDocumentTypes!: DepositDocumentType[];

  @ApiProperty({ example: 200000, description: 'Default cash deposit in VND' })
  @IsInt({ message: 'Tiền cọc mặc định phải là số nguyên.' })
  @Min(0, { message: 'Tiền cọc mặc định phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100_000_000, { message: 'Tiền cọc mặc định phải nhỏ hơn hoặc bằng $constraint1.' })
  defaultCashDeposit!: number;

  @ApiPropertyOptional({
    type: [CategoryDepositOverrideDto],
    description: 'Optional category-specific cash deposit overrides',
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách cấu hình tiền cọc theo danh mục phải là danh sách.' })
  @ValidateNested({
    each: true,
    message: 'Danh sách cấu hình tiền cọc theo danh mục có dữ liệu không hợp lệ.',
  })
  @Type(() => CategoryDepositOverrideDto)
  categoryOverrides?: CategoryDepositOverrideDto[];
}

export class ReschedulePolicyDto {
  @ApiProperty({ example: 20, description: 'Maximum allowed reschedule days from booking' })
  @IsInt({ message: 'Số ngày tối đa được đổi lịch kể từ khi đặt thuê phải là số nguyên.' })
  @Min(1, {
    message: 'Số ngày tối đa được đổi lịch kể từ khi đặt thuê phải lớn hơn hoặc bằng $constraint1.',
  })
  @Max(365, {
    message: 'Số ngày tối đa được đổi lịch kể từ khi đặt thuê phải nhỏ hơn hoặc bằng $constraint1.',
  })
  maxDaysFromBooking!: number;
}

export class LateReturnPolicyDto {
  @ApiProperty({ example: 10000, description: 'Late fee per item per day in VND' })
  @IsInt({ message: 'Phí trả trễ mỗi món mỗi ngày phải là số nguyên.' })
  @Min(0, { message: 'Phí trả trễ mỗi món mỗi ngày phải lớn hơn hoặc bằng $constraint1.' })
  @Max(10_000_000, { message: 'Phí trả trễ mỗi món mỗi ngày phải nhỏ hơn hoặc bằng $constraint1.' })
  feePerItemPerDay!: number;

  @ApiProperty({
    example: 3,
    description: 'Day of late return when a new rental cycle charge is triggered',
  })
  @IsInt({ message: 'Ngày trả trễ bắt đầu tính lượt thuê mới phải là số nguyên.' })
  @Min(1, {
    message: 'Ngày trả trễ bắt đầu tính lượt thuê mới phải lớn hơn hoặc bằng $constraint1.',
  })
  @Max(30, {
    message: 'Ngày trả trễ bắt đầu tính lượt thuê mới phải nhỏ hơn hoặc bằng $constraint1.',
  })
  newRentalChargeFromLateDay!: number;
}

export class SpecialCleaningPolicyDto {
  @ApiProperty({ example: 30000, description: 'Minimum special cleaning fee in VND' })
  @IsInt({ message: 'Phí vệ sinh đặc biệt tối thiểu phải là số nguyên.' })
  @Min(0, { message: 'Phí vệ sinh đặc biệt tối thiểu phải lớn hơn hoặc bằng $constraint1.' })
  @Max(10_000_000, {
    message: 'Phí vệ sinh đặc biệt tối thiểu phải nhỏ hơn hoặc bằng $constraint1.',
  })
  feeMin!: number;

  @ApiProperty({ example: 50000, description: 'Maximum special cleaning fee in VND' })
  @IsInt({ message: 'Phí vệ sinh đặc biệt tối đa phải là số nguyên.' })
  @Min(0, { message: 'Phí vệ sinh đặc biệt tối đa phải lớn hơn hoặc bằng $constraint1.' })
  @Max(10_000_000, { message: 'Phí vệ sinh đặc biệt tối đa phải nhỏ hơn hoặc bằng $constraint1.' })
  feeMax!: number;
}

export class LoyaltyPolicyDto {
  @ApiProperty({ example: true, description: 'Whether customer loyalty program is enabled' })
  @IsBoolean({ message: 'Trạng thái bật tích điểm phải là giá trị đúng hoặc sai.' })
  enabled!: boolean;

  @ApiProperty({
    example: 5,
    description: 'Number of completed rentals required for reward',
  })
  @IsInt({ message: 'Số lượt thuê cần để nhận thưởng phải là số nguyên.' })
  @Min(1, { message: 'Số lượt thuê cần để nhận thưởng phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100, { message: 'Số lượt thuê cần để nhận thưởng phải nhỏ hơn hoặc bằng $constraint1.' })
  rentalsRequired!: number;

  @ApiProperty({ example: 50000, description: 'Free rental value reward in VND' })
  @IsInt({ message: 'Giá trị thưởng thuê phải là số nguyên.' })
  @Min(0, { message: 'Giá trị thưởng thuê phải lớn hơn hoặc bằng $constraint1.' })
  @Max(10_000_000, { message: 'Giá trị thưởng thuê phải nhỏ hơn hoặc bằng $constraint1.' })
  rewardRentalValue!: number;

  @ApiProperty({
    example: false,
    description: 'Whether loyalty reward can be stacked with other promotions',
  })
  @IsBoolean({
    message: 'Tùy chọn kết hợp tích điểm với khuyến mãi phải là giá trị đúng hoặc sai.',
  })
  stackableWithPromotions!: boolean;
}

export class UpdateRentalPolicyReqDto {
  @ApiPropertyOptional({ type: UpdateRentalPricingPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Cấu hình giá thuê có dữ liệu không hợp lệ.' })
  @Type(() => UpdateRentalPricingPolicyDto)
  rentalPricing?: UpdateRentalPricingPolicyDto;

  @ApiPropertyOptional({ type: DepositPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Thông tin đặt cọc có dữ liệu không hợp lệ.' })
  @Type(() => DepositPolicyDto)
  deposit?: DepositPolicyDto;

  @ApiPropertyOptional({ type: ReschedulePolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Chính sách đổi lịch có dữ liệu không hợp lệ.' })
  @Type(() => ReschedulePolicyDto)
  reschedule?: ReschedulePolicyDto;

  @ApiPropertyOptional({ type: LateReturnPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Chính sách trả trễ có dữ liệu không hợp lệ.' })
  @Type(() => LateReturnPolicyDto)
  lateReturn?: LateReturnPolicyDto;

  @ApiPropertyOptional({ type: SpecialCleaningPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Chính sách vệ sinh đặc biệt có dữ liệu không hợp lệ.' })
  @Type(() => SpecialCleaningPolicyDto)
  specialCleaning?: SpecialCleaningPolicyDto;

  @ApiPropertyOptional({ type: LoyaltyPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Chính sách tích điểm có dữ liệu không hợp lệ.' })
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
