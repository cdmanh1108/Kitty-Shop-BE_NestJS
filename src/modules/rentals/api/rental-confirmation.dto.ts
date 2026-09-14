import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { DepositDocumentType, DepositMethod } from '@modules/settings/domain/rental-policy';

export class ConfirmRentalReqDto {
  @ApiPropertyOptional({ enum: ['CASH', 'BANK_TRANSFER'] })
  @IsOptional()
  @IsIn(['CASH', 'BANK_TRANSFER'], { message: 'Phương thức nhận tiền không hợp lệ.' })
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  @ApiProperty({ enum: ['CASH', 'DOCUMENT'] })
  @IsIn(['CASH', 'DOCUMENT'], { message: 'Phương thức đặt cọc không hợp lệ.' })
  collateralMethod!: DepositMethod;

  @ApiPropertyOptional({ enum: ['CCCD', 'GPLX'] })
  @IsOptional()
  @IsIn(['CCCD', 'GPLX'], {
    message: 'Loại giấy tờ phải là căn cước công dân hoặc giấy phép lái xe.',
  })
  documentType?: DepositDocumentType;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: 100000000,
    description: 'Actual deposit received; may be below the suggested deposit, including zero.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Tiền cọc phải là số có tối đa 2 chữ số thập phân.' },
  )
  @Min(0, { message: 'Tiền cọc không được âm.' })
  @Max(100000000, { message: 'Tiền cọc không được vượt quá 100.000.000 đồng.' })
  collateralAmount?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @MaxLength(2000, { message: 'Ghi chú không được vượt quá 2000 ký tự.' })
  note?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'binary',
    description: 'Optional evidence image, at most 15 MiB.',
  })
  @IsEmpty({ message: 'Bằng chứng phải là tệp ảnh tải lên.' })
  evidence?: string;
}

export class ConfirmationOptionsResDto {
  @ApiProperty({ enum: ['CASH', 'DOCUMENT'], isArray: true }) allowedMethods!: DepositMethod[];
  @ApiProperty({ enum: ['CCCD', 'GPLX'], isArray: true })
  allowedDocumentTypes!: DepositDocumentType[];
  @ApiProperty() expectedDeposit!: string;
  @ApiProperty() maxEvidenceBytes!: number;
  @ApiProperty({ type: [String] }) evidenceMimeTypes!: string[];
}

export class RentalConfirmationResDto {
  @ApiProperty({ format: 'date-time' }) confirmedAt!: string;
  @ApiProperty() confirmedBy!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({ description: 'Rental amount manually acknowledged; not a payment ledger entry.' })
  rentalAmount!: string;
  @ApiProperty() collateralMethod!: string;
  @ApiProperty({ type: String, nullable: true }) documentType!: string | null;
  @ApiProperty({ type: String, nullable: true }) collateralAmount!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() hasEvidence!: boolean;
  @ApiProperty({ type: String, nullable: true }) evidenceFilename!: string | null;
}
