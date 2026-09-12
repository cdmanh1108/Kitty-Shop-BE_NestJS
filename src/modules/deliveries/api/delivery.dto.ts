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
  @IsIn(Object.values(DELIVERY_DIRECTION), { message: 'Chiều giao dịch không hợp lệ.' })
  direction!: DeliveryDirection;
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD), { message: 'Phương thức không hợp lệ.' })
  method!: DeliveryMethod;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian hẹn phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  scheduledAt?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người nhận phải là chuỗi ký tự.' })
  @IsOptional()
  recipientName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người nhận phải là chuỗi ký tự.' })
  @IsOptional()
  recipientPhone?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' })
  @IsOptional()
  addressLine?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Phường/xã phải là chuỗi ký tự.' })
  @IsOptional()
  ward?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Quận/huyện phải là chuỗi ký tự.' })
  @IsOptional()
  district?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Thành phố phải là chuỗi ký tự.' })
  @IsOptional()
  city?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự.' })
  @IsOptional()
  province?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người giao hàng phải là chuỗi ký tự.' })
  @IsOptional()
  shipperName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người giao hàng phải là chuỗi ký tự.' })
  @IsOptional()
  shipperPhone?: string;
  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Phí giao hàng phải là số hợp lệ.' })
  @Min(0, { message: 'Phí giao hàng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  shippingFee = 0;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã vận đơn phải là chuỗi ký tự.' })
  @IsOptional()
  trackingCode?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  notes?: string;
}

export class UpdateDeliveryStatusReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_STATUS) })
  @IsIn(Object.values(DELIVERY_STATUS), { message: 'Trạng thái không hợp lệ.' })
  status!: DeliveryStatus;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người giao hàng phải là chuỗi ký tự.' })
  @IsOptional()
  shipperName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người giao hàng phải là chuỗi ký tự.' })
  @IsOptional()
  shipperPhone?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã vận đơn phải là chuỗi ký tự.' })
  @IsOptional()
  trackingCode?: string;
}
