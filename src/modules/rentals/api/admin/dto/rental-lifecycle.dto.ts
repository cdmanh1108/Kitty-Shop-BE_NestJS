import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { RentalChargeReqDto } from './rental-creation.dto';

export class TransitionRentalReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự.' })
  @IsOptional()
  reason?: string;
}

export class RescheduleRentalReqDto {
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalStartAt!: string;
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalEndAt!: string;
}

export class AddRentalChargeReqDto extends RentalChargeReqDto {}
