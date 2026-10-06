import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ValidateIf,
  IsNumber,
  Min,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { RentalChargeReqDto } from './rental-creation.dto';

export class RentalItemFeeOverrideReqDto {
  @ApiProperty({
    minimum: 0,
    description:
      'Tổng phí trả trễ/thuê thêm của một SKU; thay thế phí tự tính, không cộng chồng. Giá 0 hợp lệ.',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Phí ghi đè phải là số hữu hạn với tối đa hai chữ số thập phân.' },
  )
  @Min(0, { message: 'Phí ghi đè không được âm.' })
  amount!: number;
  @ApiProperty({ maxLength: 2000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do ghi đè phải là chuỗi ký tự.' })
  @MinLength(1, { message: 'Vui lòng nhập lý do ghi đè phí.' })
  @MaxLength(2000, { message: 'Lý do ghi đè không được vượt quá 2.000 ký tự.' })
  reason!: string;
}

export class ReturnItemChargeReqDto extends RentalItemFeeOverrideReqDto {
  @ApiProperty({ enum: ['CLEANING', 'REPAIR', 'DAMAGE', 'LOST_ITEM'] })
  @IsIn(['CLEANING', 'REPAIR', 'DAMAGE', 'LOST_ITEM'], {
    message: 'Loại phí kiểm tra món đồ không hợp lệ.',
  })
  chargeType!: string;
}

export class ReturnPreviewQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Thời gian nhận trả phải là ngày giờ ISO 8601 hợp lệ.' },
  )
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'Thời gian nhận trả phải có giờ và múi giờ.' })
  returnedAt?: string;
}

export class ReturnInspectionItemReqDto {
  @ApiProperty({ description: 'ID của món đồ (physical inventory item)' })
  @IsUUID('4', { message: 'Mã món đồ phải là UUID hợp lệ.' })
  inventoryItemId!: string;

  @ApiProperty({
    enum: ['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'],
    example: 'NORMAL',
  })
  @IsIn(['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'], {
    message: 'Tình trạng kiểm tra không hợp lệ.',
  })
  condition!: string;

  @ApiPropertyOptional({ description: 'Ghi chú hiện trạng' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ type: RentalItemFeeOverrideReqDto })
  @ValidateIf((_: ReturnInspectionItemReqDto, value: unknown) => value !== undefined)
  @ValidateNested({ message: 'Thông tin ghi đè phí không hợp lệ.' })
  @Type(() => RentalItemFeeOverrideReqDto)
  lateFeeOverride?: RentalItemFeeOverrideReqDto;

  @ApiPropertyOptional({
    type: ReturnItemChargeReqDto,
    description:
      'Bồi thường hoặc phí kiểm tra gắn với đúng SKU. Phụ kiện miễn phí chỉ nhận bồi thường mất/hỏng.',
  })
  @ValidateIf((_: ReturnInspectionItemReqDto, value: unknown) => value !== undefined)
  @ValidateNested({ message: 'Phí kiểm tra món đồ không hợp lệ.' })
  @Type(() => ReturnItemChargeReqDto)
  charge?: ReturnItemChargeReqDto;
}

export class ReturnRentalOrderReqDto {
  @ApiPropertyOptional({
    description: 'Mã đối chiếu từ return-preview; phí vẫn được backend tính lại khi lưu.',
  })
  @ValidateIf((_: ReturnRentalOrderReqDto, value: unknown) => value !== undefined)
  @Matches(/^[a-f0-9]{64}$/, { message: 'Mã đối chiếu phí không hợp lệ.' })
  feePreviewToken?: string;
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Thời điểm trả thực tế (mặc định là hiện tại)',
  })
  @IsDateString({ strict: true }, { message: 'Thời gian trả đồ không hợp lệ.' })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i, { message: 'Thời gian trả đồ phải có giờ và múi giờ.' })
  @IsOptional()
  actualReturnedAt?: string;

  @ApiProperty({ type: [ReturnInspectionItemReqDto] })
  @IsArray({ message: 'Danh sách kiểm tra phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Phải có ít nhất 1 món đồ để kiểm tra.' })
  @ValidateNested({ each: true })
  @Type(() => ReturnInspectionItemReqDto)
  inspections!: ReturnInspectionItemReqDto[];

  @ApiPropertyOptional({ type: [RentalChargeReqDto] })
  @IsArray({ message: 'Danh sách phụ phí phải là danh sách.' })
  @ValidateNested({ each: true })
  @Type(() => RentalChargeReqDto)
  @IsOptional()
  manualCharges?: RentalChargeReqDto[];

  @ApiPropertyOptional({ description: 'Ghi chú trả hàng' })
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
}

export class ReturnPreviewItemDto {
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantTitle!: string;
  @ApiPropertyOptional() billingRole?: string;
  @ApiPropertyOptional() pricingVersion?: string;
  @ApiPropertyOptional({ type: String }) calculatedLateFee?: string;
  @ApiPropertyOptional({ type: String }) calculatedAdditionalRentalFee?: string;
}

export class ReturnPreviewResDto {
  @ApiProperty({ format: 'date-time' }) rentalEndAt!: string;
  @ApiProperty({ format: 'date-time' }) actualReturnedAt!: string;
  @ApiProperty() lateDays!: number;
  @ApiProperty() dailyLateFeePerSet!: number;
  @ApiProperty({ type: String, example: '20000.00' }) lateFee!: string;
  @ApiProperty({ type: String, example: '0.00' }) additionalRentalFee!: string;
  @ApiProperty({ type: [ReturnPreviewItemDto] }) items!: ReturnPreviewItemDto[];
  @ApiPropertyOptional() durationDays?: number;
  @ApiPropertyOptional() actualDurationDays?: number;
  @ApiPropertyOptional() feePreviewToken?: string;
}

export class RentalReturnInspectionResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty({
    enum: ['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'],
  })
  condition!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) calculatedLateFee?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) calculatedAdditionalRentalFee?:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lateFee?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) additionalRentalFee?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) feeOverrideReason?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) pricingVersion?: string | null;
}

export class RentalReturnResDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({ format: 'date-time' }) returnedAt!: string;
  @ApiProperty() receivedBy!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty() lateDays!: number;
  @ApiProperty({ type: String, example: '20000.00' }) lateFee!: string;
  @ApiProperty({ type: String, example: '0.00' }) additionalRentalFee!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: [RentalReturnInspectionResDto] })
  inspections!: RentalReturnInspectionResDto[];
}
