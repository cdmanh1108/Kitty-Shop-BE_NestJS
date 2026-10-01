import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDefined,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
  ValidateNested,
} from 'class-validator';
import {
  WEB_RENTAL_MAX_ITEM_COUNT,
  WEB_RENTAL_MAX_QUANTITY_PER_ITEM,
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

export class WebRentalQuoteItemResDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'ID sản phẩm nếu đã xác định được' })
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ID biến thể nếu đã xác định được' })
  variantId?: string;

  @ApiProperty({ example: 2, description: 'Số lượng yêu cầu sau khi gộp các dòng cùng biến thể' })
  requestedQuantity!: number;

  @ApiProperty({ example: 1, description: 'Số lượng vật lý còn trống cho toàn bộ khoảng thuê' })
  availableQuantity!: number;

  @ApiProperty({
    example: false,
    description: 'Dòng có đủ tồn kho và có giá thuê cho thời lượng này',
  })
  available!: boolean;

  @ApiPropertyOptional({ enum: ['NOT_RENTABLE', 'INSUFFICIENT_QUANTITY', 'PRICE_UNAVAILABLE'] })
  issue?: 'NOT_RENTABLE' | 'INSUFFICIENT_QUANTITY' | 'PRICE_UNAVAILABLE';
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

  @ApiPropertyOptional({
    example: true,
    description:
      'Có thể tiếp tục checkout khi khoảng thuê hợp lệ và mọi dòng đã có tồn kho, giá thuê',
  })
  canCheckout?: boolean;

  @ApiPropertyOptional({
    type: [WebRentalQuoteItemResDto],
    description: 'Kết quả theo biến thể, giữ thứ tự yêu cầu; số lượng trùng biến thể được gộp',
  })
  items?: WebRentalQuoteItemResDto[];
}
