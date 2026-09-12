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
  @IsString({ message: 'Mã danh mục phải là chuỗi ký tự.' })
  categoryId!: string;

  @ApiProperty({ example: 300000, description: 'Cash deposit amount for this category in VND' })
  @IsInt({ message: 'Tiền cọc phải là số nguyên.' })
  @Min(0, { message: 'Tiền cọc phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100_000_000, { message: 'Tiền cọc phải nhỏ hơn hoặc bằng $constraint1.' })
  cashAmount!: number;
}

export class RentalPricingPolicyDto {
  @ApiProperty({ example: 50000, description: 'Default rental price in VND' })
  @IsInt({ message: 'Giá thuê mặc định phải là số nguyên.' })
  @Min(0, { message: 'Giá thuê mặc định phải lớn hơn hoặc bằng $constraint1.' })
  @Max(100_000_000, { message: 'Giá thuê mặc định phải nhỏ hơn hoặc bằng $constraint1.' })
  defaultRentalPrice!: number;
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
  @ApiPropertyOptional({ type: RentalPricingPolicyDto })
  @IsOptional()
  @ValidateNested({ message: 'Cấu hình giá thuê có dữ liệu không hợp lệ.' })
  @Type(() => RentalPricingPolicyDto)
  rentalPricing?: RentalPricingPolicyDto;

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
