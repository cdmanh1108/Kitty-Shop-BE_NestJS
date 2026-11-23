import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDefined,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsNumber,
  Min,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  WEB_RENTAL_MAX_ADDRESS_LENGTH,
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_DATE_TIME_PATTERN,
} from '../../../application/web-rental-input-validation';
import { WEB_PAYMENT_PREFERENCES } from '../../../domain/web-payment-preference';
import { WebRentalItemInputDto } from './web-rental-evaluation.dto';

export class WebCreateOrderCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên người thuê.' })
  @Matches(/\S/, { message: 'Tên người thuê không được chỉ gồm khoảng trắng.' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại.' })
  @Matches(/^(0|\+84)[0-9\s.-]{8,12}$/, { message: 'Số điện thoại không đúng định dạng.' })
  phone!: string;

  @ApiPropertyOptional({ example: 'Giao buổi sáng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class WebCreateOrderDeliveryDto {
  @ApiProperty({ example: 'self_pickup', enum: ['self_pickup', 'shop_delivery'] })
  @IsIn(['self_pickup', 'shop_delivery'])
  method!: 'self_pickup' | 'shop_delivery';

  @ApiPropertyOptional({
    example: '123 Đường 30/4, Ninh Kiều, Cần Thơ',
    maxLength: WEB_RENTAL_MAX_ADDRESS_LENGTH,
    description: 'Bắt buộc khi method là shop_delivery.',
  })
  @ValidateIf(
    (delivery: WebCreateOrderDeliveryDto, value: unknown) =>
      delivery.method === 'shop_delivery' || value !== undefined,
  )
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập địa chỉ giao hàng.' })
  @Matches(/\S/, { message: 'Địa chỉ giao hàng không được chỉ gồm khoảng trắng.' })
  @MaxLength(WEB_RENTAL_MAX_ADDRESS_LENGTH)
  address?: string;
}

export class WebCheckoutQuoteDto {
  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rentalSubtotal!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingFee!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Tổng tiền thuê và phí sau giảm, chưa gồm cọc.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;
}

export class WebCreateOrderReqDto {
  @ApiProperty({
    type: WebCheckoutQuoteDto,
    description:
      'Các khoản tiền khách vừa kiểm tra. Hệ thống tự tính lại và đối chiếu trước khi tạo đơn.',
  })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => WebCheckoutQuoteDto)
  expectedQuote!: WebCheckoutQuoteDto;

  @ApiProperty({ type: WebCreateOrderCustomerDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => WebCreateOrderCustomerDto)
  customer!: WebCreateOrderCustomerDto;

  @ApiProperty({
    example: '2026-09-20T01:30:00.000Z',
    format: 'date-time',
    description: 'Mốc nhận ISO 8601 có múi giờ; hệ thống hiển thị theo giờ Việt Nam (UTC+07:00).',
  })
  @IsString()
  @Matches(WEB_RENTAL_DATE_TIME_PATTERN, {
    message: 'Ngày giờ nhận không hợp lệ. Vui lòng chọn lại.',
  })
  pickupDate!: string;

  @ApiProperty({
    example: '2026-09-23T01:30:00.000Z',
    format: 'date-time',
    description: 'Mốc trả ISO 8601 có múi giờ; hệ thống hiển thị theo giờ Việt Nam (UTC+07:00).',
  })
  @IsString()
  @Matches(WEB_RENTAL_DATE_TIME_PATTERN, {
    message: 'Ngày giờ trả không hợp lệ. Vui lòng chọn lại.',
  })
  returnDate!: string;

  @ApiProperty({ type: [WebRentalItemInputDto], maxItems: WEB_RENTAL_MAX_ITEM_COUNT })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEB_RENTAL_MAX_ITEM_COUNT)
  @ValidateNested({ each: true })
  @Type(() => WebRentalItemInputDto)
  items!: WebRentalItemInputDto[];

  @ApiProperty({ type: WebCreateOrderDeliveryDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => WebCreateOrderDeliveryDto)
  delivery!: WebCreateOrderDeliveryDto;

  @ApiProperty({
    example: 'bank_transfer',
    enum: WEB_PAYMENT_PREFERENCES,
    description:
      'Phương thức khách mong muốn. Lựa chọn này được lưu cho đơn thuê, không tạo giao dịch, không xác nhận đã thanh toán, và không khởi tạo cổng thanh toán.',
  })
  @IsIn(WEB_PAYMENT_PREFERENCES)
  paymentMethod!: (typeof WEB_PAYMENT_PREFERENCES)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Ưu đãi được chọn trong báo giá.' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Mã ưu đãi không hợp lệ.' })
  loyaltyRewardId?: string;
}

export class WebCreateOrderResDto {
  @ApiProperty({ example: 'KT260920-001' })
  orderCode!: string;

  @ApiProperty({ example: 480000 })
  totalAmount!: number;

  @ApiProperty({ example: 500000 })
  depositAmount!: number;

  @ApiProperty({ example: 'reserved' })
  status!: string;

  @ApiProperty({ example: 'unpaid', enum: ['unpaid', 'paid', 'partially_paid'] })
  paymentStatus!: string;
}
