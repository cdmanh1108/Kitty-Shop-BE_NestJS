import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { RentalChargeReqDto } from './rental-creation.dto';

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
}

export class ReturnRentalOrderReqDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Thời điểm trả thực tế (mặc định là hiện tại)',
  })
  @IsDateString(undefined, { message: 'Thời gian trả đồ không hợp lệ.' })
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
}

export class ReturnPreviewResDto {
  @ApiProperty({ format: 'date-time' }) rentalEndAt!: string;
  @ApiProperty({ format: 'date-time' }) actualReturnedAt!: string;
  @ApiProperty() lateDays!: number;
  @ApiProperty() dailyLateFeePerSet!: number;
  @ApiProperty({ type: String, example: '20000.00' }) lateFee!: string;
  @ApiProperty({ type: String, example: '0.00' }) additionalRentalFee!: string;
  @ApiProperty({ type: [ReturnPreviewItemDto] }) items!: ReturnPreviewItemDto[];
}

export class RentalReturnInspectionResDto {
  @ApiProperty() id!: string;
  @ApiProperty() inventoryItemId!: string;
  @ApiProperty({
    enum: ['NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST'],
  })
  condition!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
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
