import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { RentalChargeReqDto } from './rental-creation.dto';

export class TransitionRentalReqDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Lý do nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  reason?: string;
}

export class RescheduleRentalReqDto {
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê không hợp lệ. Vui lòng chọn lại ngày giờ.',
  })
  rentalStartAt!: string;
  @ApiProperty()
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê không hợp lệ. Vui lòng chọn lại ngày giờ.',
  })
  rentalEndAt!: string;
}

export class AddRentalChargeReqDto extends RentalChargeReqDto {}
