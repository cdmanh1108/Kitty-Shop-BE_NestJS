import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDefined,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
  ValidateNested,
} from 'class-validator';
import {
  WEB_RENTAL_MAX_ADDRESS_LENGTH,
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_MAX_QUANTITY_PER_ITEM,
  WEB_RENTAL_MAX_SOCIAL_CONTACT_LENGTH,
} from '../../../application/web-rental-input-validation';

@ValidatorConstraint({ name: 'webRentalSelection', async: false })
class WebRentalSelectionConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const value = args.object as { productId?: unknown; variantId?: unknown };
    return value.productId !== undefined || value.variantId !== undefined;
  }

  defaultMessage(): string {
    return 'Vui lòng cung cấp productId hoặc variantId.';
  }
}

export class WebAvailabilityQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'ID của sản phẩm hoặc biến thể' })
  @ValidateIf((_: WebAvailabilityQueryDto, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ID của biến thể cụ thể' })
  @ValidateIf((_: WebAvailabilityQueryDto, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId?: string;

  @ApiProperty({ example: '2026-09-20', format: 'date', description: 'Ngày nhận (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23', format: 'date', description: 'Ngày trả (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
  @Validate(WebRentalSelectionConstraint)
  returnDate!: string;
}

export class WebAvailabilityResDto {
  @ApiProperty({ example: true })
  available!: boolean;

  @ApiPropertyOptional({ example: 2 })
  availableQuantity?: number;
}

export class WebRentalItemInputDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'ID biến thể sản phẩm' })
  @ValidateIf((_: WebRentalItemInputDto, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'Mã biến thể phải là UUID hợp lệ.' })
  variantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ID sản phẩm' })
  @ValidateIf((_: WebRentalItemInputDto, value: unknown) => value !== undefined)
  @IsUUID(undefined, { message: 'Mã sản phẩm phải là UUID hợp lệ.' })
  productId?: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: WEB_RENTAL_MAX_QUANTITY_PER_ITEM })
  @IsInt()
  @Min(1)
  @Max(WEB_RENTAL_MAX_QUANTITY_PER_ITEM)
  @Validate(WebRentalSelectionConstraint)
  quantity!: number;
}

export class WebRentalQuoteReqDto {
  @ApiProperty({ example: '2026-09-20', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
  returnDate!: string;

  @ApiProperty({ type: [WebRentalItemInputDto], maxItems: WEB_RENTAL_MAX_ITEM_COUNT })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(WEB_RENTAL_MAX_ITEM_COUNT)
  @ValidateNested({ each: true })
  @Type(() => WebRentalItemInputDto)
  items!: WebRentalItemInputDto[];

  @ApiPropertyOptional({ example: 'self_pickup', enum: ['self_pickup', 'shop_delivery'] })
  @IsOptional()
  @IsIn(['self_pickup', 'shop_delivery'])
  deliveryMethod?: 'self_pickup' | 'shop_delivery';
}

export class WebRentalQuoteResDto {
  @ApiProperty({ example: 3, description: 'Số ngày thuê tính theo lịch' })
  durationDays!: number;

  @ApiProperty({ example: 450000, description: 'Tiền thuê tạm tính (VND)' })
  rentalSubtotal!: number;

  @ApiProperty({ example: 500000, description: 'Tiền cọc dự kiến (VND)' })
  depositAmount!: number;

  @ApiProperty({ example: 30000, description: 'Phí vận chuyển dự kiến (VND)' })
  shippingFee!: number;

  @ApiProperty({ example: 480000, description: 'Tổng tiền thanh toán dự kiến (VND)' })
  totalAmount!: number;

  @ApiProperty({ example: 'VND' })
  currency!: string;

  @ApiProperty({ example: true, description: 'Tất cả sản phẩm có sẵn trong khoảng ngày đã chọn' })
  available!: boolean;
}

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

  @ApiPropertyOptional({
    example: 'nguyenvana@gmail.com',
    maxLength: 255,
    description: 'Có thể bỏ trống; nếu có nội dung phải là email hợp lệ.',
  })
  @IsOptional()
  @ValidateIf(
    (_: WebCreateOrderCustomerDto, value: unknown) =>
      typeof value !== 'string' || value.trim().length > 0,
  )
  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Email không đúng định dạng.' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: 'https://facebook.com/nguyenvana',
    maxLength: WEB_RENTAL_MAX_SOCIAL_CONTACT_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(WEB_RENTAL_MAX_SOCIAL_CONTACT_LENGTH)
  facebookOrZalo?: string;

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

export class WebCreateOrderCollateralDto {
  @ApiPropertyOptional({ example: 'CASH', enum: ['CASH', 'DOCUMENT'] })
  @IsOptional()
  @IsIn(['CASH', 'DOCUMENT'])
  method?: 'CASH' | 'DOCUMENT';

  @ApiPropertyOptional({ example: 'CCCD', enum: ['CCCD', 'GPLX'] })
  @IsOptional()
  @IsIn(['CCCD', 'GPLX'])
  documentType?: 'CCCD' | 'GPLX';
}

export class WebCreateOrderReqDto {
  @ApiProperty({ type: WebCreateOrderCustomerDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => WebCreateOrderCustomerDto)
  customer!: WebCreateOrderCustomerDto;

  @ApiProperty({ example: '2026-09-20', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
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

  @ApiProperty({ example: 'bank_transfer', enum: ['cash', 'bank_transfer', 'momo'] })
  @IsIn(['cash', 'bank_transfer', 'momo'])
  paymentMethod!: 'cash' | 'bank_transfer' | 'momo';

  @ApiPropertyOptional({ type: WebCreateOrderCollateralDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebCreateOrderCollateralDto)
  collateral?: WebCreateOrderCollateralDto;
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

export class WebOrderLookupReqDto {
  @ApiProperty({ example: 'KT260920-001', description: 'Mã đơn thuê đã được cấp' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập mã đơn.' })
  orderCode!: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại đặt thuê để xác thực' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại.' })
  phone!: string;
}

export class WebOrderLookupItemDto {
  @ApiProperty({ example: 'Đầm dạ hội trắng lụa cao cấp' })
  name!: string;

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1' })
  imageUrl!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;
}

export class WebOrderLookupResDto {
  @ApiProperty({ example: 'KT260920-001' })
  orderCode!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  customerName!: string;

  @ApiProperty({ example: '091****678' })
  phoneMasked!: string;

  @ApiProperty({ example: '2026-09-20' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23' })
  returnDate!: string;

  @ApiProperty({ example: 'pending' })
  status!: string;

  @ApiProperty({ example: 480000 })
  totalAmount!: number;

  @ApiProperty({ example: 500000 })
  depositAmount!: number;

  @ApiProperty({
    example: 450000,
    description:
      'Net completed, non-voided non-deposit payment amount: inbound payments less outbound refunds. Deposit movements are excluded; a deposit offset contributes only its rental-payment leg.',
  })
  paidAmount!: number;

  @ApiProperty({ type: [WebOrderLookupItemDto] })
  items!: WebOrderLookupItemDto[];
}
