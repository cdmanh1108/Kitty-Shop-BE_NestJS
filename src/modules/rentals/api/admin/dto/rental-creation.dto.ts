import { CHARGE_TYPE } from '@modules/rentals/domain/charge-type';
import { DELIVERY_DIRECTION, DELIVERY_METHOD } from '@modules/deliveries/public/delivery-contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRentalItemReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId!: string;
  @ApiProperty({ type: Number, default: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn hoặc bằng $constraint1.' })
  @Max(20, { message: 'Số lượng phải nhỏ hơn hoặc bằng $constraint1.' })
  quantity = 1;
  @ApiPropertyOptional({
    type: Number,
    description:
      'Đơn giá thuê mỗi món do admin ghi đè (VNĐ). Nếu để trống, hệ thống dùng giá cấu hình.',
    example: 150000,
  })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Đơn giá thuê ghi đè phải là số hợp lệ.' })
  @Min(0, { message: 'Đơn giá thuê ghi đè phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  unitRentalPrice?: number;
  @ApiPropertyOptional({
    type: [String],
    description: 'Optional physical item selection; otherwise backend auto-allocates.',
  })
  @IsArray({ message: 'Danh sách mã món đồ phải là danh sách.' })
  @IsUUID('4', { each: true, message: 'Danh sách mã món đồ phải là UUID hợp lệ.' })
  @IsOptional()
  inventoryItemIds?: string[];
}

export class RentalChargeReqDto {
  @ApiProperty({ enum: Object.values(CHARGE_TYPE), example: 'ACCESSORY' })
  @IsIn(Object.values(CHARGE_TYPE), { message: 'Loại phụ phí không hợp lệ.' })
  chargeType!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự.' })
  @IsOptional()
  description?: string;
  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Số tiền phải là số hợp lệ.' })
  @Min(0, { message: 'Số tiền phải lớn hơn hoặc bằng $constraint1.' })
  amount!: number;
  @ApiPropertyOptional({ type: Number, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  quantity = 1;
}

export class RentalDeliveryReqDto {
  @ApiProperty({ enum: Object.values(DELIVERY_DIRECTION), default: 'OUTBOUND' })
  @IsIn(Object.values(DELIVERY_DIRECTION), { message: 'Chiều giao dịch không hợp lệ.' })
  direction = 'OUTBOUND';
  @ApiProperty({ enum: Object.values(DELIVERY_METHOD) })
  @IsIn(Object.values(DELIVERY_METHOD), { message: 'Phương thức không hợp lệ.' })
  method!: string;
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
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Phí giao hàng phải là số hợp lệ.' })
  @Min(0, { message: 'Phí giao hàng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  shippingFee = 0;
}

export class RentalCollateralReqDto {
  @ApiProperty({ enum: ['CASH', 'DOCUMENT'] })
  @IsIn(['CASH', 'DOCUMENT'], { message: 'Phương thức không hợp lệ.' })
  method!: 'CASH' | 'DOCUMENT';
  @ApiPropertyOptional({ enum: ['CCCD', 'GPLX'] })
  @IsIn(['CCCD', 'GPLX'], { message: 'Loại giấy tờ không hợp lệ.' })
  @IsOptional()
  documentType?: 'CCCD' | 'GPLX';
}

export class CreateRentalOrderReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Mã khách hàng phải là UUID hợp lệ.' })
  customerId!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Mã địa điểm phải là UUID hợp lệ.' })
  @IsOptional()
  locationId?: string;
  @ApiProperty({ example: '2026-09-12T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalStartAt!: string;
  @ApiProperty({ example: '2026-09-14T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  rentalEndAt!: string;
  @ApiProperty({ type: [CreateRentalItemReqDto] })
  @IsArray({ message: 'Danh sách sản phẩm thuê phải là danh sách.' })
  @ArrayMinSize(1, { message: 'Danh sách sản phẩm thuê phải có ít nhất $constraint1 phần tử.' })
  @ValidateNested({ each: true, message: 'Danh sách sản phẩm thuê có dữ liệu không hợp lệ.' })
  @Type(() => CreateRentalItemReqDto)
  items!: CreateRentalItemReqDto[];
  @ApiPropertyOptional({ type: [RentalChargeReqDto] })
  @IsArray({ message: 'Danh sách phụ phí phải là danh sách.' })
  @ValidateNested({ each: true, message: 'Danh sách phụ phí có dữ liệu không hợp lệ.' })
  @Type(() => RentalChargeReqDto)
  @IsOptional()
  charges: RentalChargeReqDto[] = [];
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Tổng tiền giảm giá phải là số hợp lệ.' })
  @Min(0, { message: 'Tổng tiền giảm giá phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  discountTotal = 0;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @IsOptional()
  note?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú nội bộ phải là chuỗi ký tự.' })
  @IsOptional()
  internalNote?: string;
  @ApiPropertyOptional({ type: RentalDeliveryReqDto })
  @ValidateNested({ message: 'Thông tin giao hàng có dữ liệu không hợp lệ.' })
  @Type(() => RentalDeliveryReqDto)
  @IsOptional()
  delivery?: RentalDeliveryReqDto;
  @ApiPropertyOptional({ type: () => RentalCollateralReqDto })
  @ValidateNested({ message: 'Thông tin đặt cọc có dữ liệu không hợp lệ.' })
  @Type(() => RentalCollateralReqDto)
  @IsOptional()
  collateral?: RentalCollateralReqDto;
}
