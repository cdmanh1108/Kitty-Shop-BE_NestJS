import {
  type DeliveryDirection,
  type DeliveryMethod,
  type DeliveryStatus,
  DELIVERY_DIRECTION,
  DELIVERY_METHOD,
  DELIVERY_STATUS,
} from '@modules/deliveries/domain/delivery-status';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class DeliveryPageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Đơn thuê không hợp lệ. Vui lòng chọn lại.' })
  orderId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Từ khóa tìm giao nhận tối đa 200 ký tự.' })
  search?: string;

  @ApiPropertyOptional({ enum: Object.values(DELIVERY_DIRECTION) })
  @IsOptional()
  @IsIn(Object.values(DELIVERY_DIRECTION), { message: 'Chiều giao nhận không hợp lệ.' })
  direction?: DeliveryDirection;

  @ApiPropertyOptional({ enum: Object.values(DELIVERY_METHOD) })
  @IsOptional()
  @IsIn(Object.values(DELIVERY_METHOD), { message: 'Hình thức giao nhận không hợp lệ.' })
  method?: DeliveryMethod;

  @ApiPropertyOptional({ enum: Object.values(DELIVERY_STATUS) })
  @IsOptional()
  @IsIn(Object.values(DELIVERY_STATUS), { message: 'Trạng thái giao nhận không hợp lệ.' })
  status?: DeliveryStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Thời gian bắt đầu không hợp lệ.' })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Exclusive upper bound' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Thời gian kết thúc không hợp lệ.' })
  until?: string;
}

export class CreateDeliveryReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION) })
  @IsIn(Object.values(DELIVERY_DIRECTION), { message: 'Chiều giao dịch không hợp lệ.' })
  direction!: DeliveryDirection;
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD), { message: 'Phương thức không hợp lệ.' })
  method!: DeliveryMethod;
  @ApiPropertyOptional()
  @IsDateString(undefined, {
    message: 'Thời gian hẹn không hợp lệ. Vui lòng chọn lại ngày giờ.',
  })
  @IsOptional()
  scheduledAt?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người nhận nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  recipientName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người nhận nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  recipientPhone?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Địa chỉ nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  addressLine?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Phường/xã nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  ward?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Quận/huyện nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  district?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Thành phố nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  city?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tỉnh/thành nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  province?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người giao hàng nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  shipperName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người giao hàng nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  shipperPhone?: string;
  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Phí giao hàng phải là số hợp lệ.' })
  @Min(0, { message: 'Phí giao hàng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  shippingFee = 0;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã vận đơn nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  trackingCode?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  notes?: string;
}

export class UpdateDeliveryStatusReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_STATUS) })
  @IsIn(Object.values(DELIVERY_STATUS), { message: 'Trạng thái không hợp lệ.' })
  status!: DeliveryStatus;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người giao hàng nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  shipperName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại người giao hàng nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  shipperPhone?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mã vận đơn nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
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

export class DeliverySummaryResDto {
  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  pickupCount!: number;

  @ApiProperty()
  shopDeliveryCount!: number;

  @ApiProperty()
  thirdPartyCount!: number;
}

export class DeliveryPageResDto {
  @ApiProperty({ type: [DeliveryResDto] })
  items!: DeliveryResDto[];

  @ApiProperty({ type: PaginationMetaResDto })
  meta!: PaginationMetaResDto;

  @ApiProperty({ type: DeliverySummaryResDto })
  summary!: DeliverySummaryResDto;
}
