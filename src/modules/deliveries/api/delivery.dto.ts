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

export class DeliveryCustomerResDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;
}

export class DeliveryOrderResDto {
  @ApiProperty()
  orderNumber!: string;

  @ApiPropertyOptional({ type: DeliveryCustomerResDto, nullable: true })
  customer!: DeliveryCustomerResDto | null;
}

export class DeliveryResDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION) })
  direction!: DeliveryDirection;

  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  method!: DeliveryMethod;

  @ApiProperty({ enum: Object.values(DELIVERY_STATUS) })
  status!: DeliveryStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  scheduledAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  pickedUpAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  recipientName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  recipientPhone!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  addressLine!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ward!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  district!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  city!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  province!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  shipperName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  shipperPhone!: string | null;

  @ApiProperty({ type: String, example: '30000.00' })
  shippingFee!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  trackingCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ type: DeliveryOrderResDto, nullable: true })
  order?: DeliveryOrderResDto | null;
}
