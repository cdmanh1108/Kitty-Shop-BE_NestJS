import { CHARGE_TYPE } from '@modules/rentals/domain/charge-type';
import { RENTAL_BILLING_ROLE, type RentalBillingRole } from '../../../domain/rental-accessories';
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
  ValidateIf,
} from 'class-validator';

export class CreateRentalItemReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Size hoặc màu không hợp lệ. Vui lòng chọn lại.' })
  variantId!: string;
  @ApiProperty({ type: Number, default: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn hoặc bằng $constraint1.' })
  @Max(20, { message: 'Số lượng phải nhỏ hơn hoặc bằng $constraint1.' })
  quantity = 1;
  @ApiPropertyOptional({
    enum: Object.values(RENTAL_BILLING_ROLE),
    description:
      'Bỏ trống là thuê có tính phí (PAID). FREE_ACCESSORY chỉ dành cho phụ kiện đi kèm trong hạn mức của từng sản phẩm thuê có phí.',
  })
  @ValidateIf((_: CreateRentalItemReqDto, value: unknown) => value !== undefined)
  @IsIn(Object.values(RENTAL_BILLING_ROLE), {
    message: 'Vai trò tính tiền phải là thuê có tính phí hoặc phụ kiện miễn phí.',
  })
  billingRole?: RentalBillingRole;
  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    example: 60000,
    description:
      'Giá một lượt thuê cho mỗi món của phân loại (VND), áp dụng lại tại mỗi mốc lượt mới; ưu tiên hơn giá ghi đè của đơn. Giá 0 hợp lệ.',
  })
  @Type(() => Number)
  @ValidateIf((_: CreateRentalItemReqDto, value: unknown) => value !== undefined)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Giá một lượt thuê ghi đè phải là số hữu hạn, có tối đa hai chữ số thập phân.' },
  )
  @Min(0, { message: 'Giá một lượt thuê ghi đè không được âm.' })
  cyclePriceOverride?: number;
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
  @IsString({ message: 'Mô tả nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
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
  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber(undefined, { message: 'Phí giao hàng phải là số hợp lệ.' })
  @Min(0, { message: 'Phí giao hàng phải lớn hơn hoặc bằng $constraint1.' })
  @IsOptional()
  shippingFee = 0;
}

export class CreateRentalOrderReqDto {
  @ApiProperty()
  @IsUUID(undefined, { message: 'Khách hàng không hợp lệ. Vui lòng chọn lại.' })
  customerId!: string;
  @ApiPropertyOptional()
  @IsUUID(undefined, { message: 'Vị trí kho không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  locationId?: string;
  @ApiProperty({ example: '2026-09-12T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian bắt đầu thuê không hợp lệ. Vui lòng chọn lại ngày giờ.',
  })
  rentalStartAt!: string;
  @ApiProperty({ example: '2026-09-14T03:00:00.000Z' })
  @IsDateString(undefined, {
    message: 'Thời gian kết thúc thuê không hợp lệ. Vui lòng chọn lại ngày giờ.',
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
  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    example: 60000,
    description:
      'Giá một lượt thuê chung cho mỗi món trong đơn (VND), áp dụng lại tại mỗi mốc lượt mới. Ghi đè của từng món được ưu tiên; bỏ trống dùng Cài đặt. Giá 0 hợp lệ.',
  })
  @Type(() => Number)
  @ValidateIf((_: CreateRentalOrderReqDto, value: unknown) => value !== undefined)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'Giá một lượt thuê ghi đè của đơn phải là số hữu hạn, có tối đa hai chữ số thập phân.',
    },
  )
  @Min(0, { message: 'Giá một lượt thuê ghi đè của đơn không được âm.' })
  cyclePriceOverride?: number;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  note?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú nội bộ nhập chưa hợp lệ. Vui lòng kiểm tra lại.' })
  @IsOptional()
  internalNote?: string;
  @ApiPropertyOptional({ type: RentalDeliveryReqDto })
  @ValidateNested({ message: 'Thông tin giao hàng có dữ liệu không hợp lệ.' })
  @Type(() => RentalDeliveryReqDto)
  @IsOptional()
  delivery?: RentalDeliveryReqDto;
}
