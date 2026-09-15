import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WebAvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'ID của sản phẩm hoặc biến thể' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'ID của biến thể cụ thể' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ example: '2026-09-20', description: 'Ngày nhận (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23', description: 'Ngày trả (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
  returnDate!: string;
}

export class WebAvailabilityResDto {
  @ApiProperty({ example: true })
  available!: boolean;

  @ApiPropertyOptional({ example: 2 })
  availableQuantity?: number;
}

export class WebRentalItemInputDto {
  @ApiPropertyOptional({ description: 'ID biến thể sản phẩm' })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({ description: 'ID sản phẩm' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 1, default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class WebRentalQuoteReqDto {
  @ApiProperty({ example: '2026-09-20' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
  returnDate!: string;

  @ApiProperty({ type: [WebRentalItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
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
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại.' })
  @Matches(/^(0|\+84)[0-9\s.-]{8,12}$/, { message: 'Số điện thoại không đúng định dạng.' })
  phone!: string;

  @ApiPropertyOptional({ example: 'nguyenvana@gmail.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/nguyenvana' })
  @IsOptional()
  @IsString()
  facebookOrZalo?: string;

  @ApiPropertyOptional({ example: 'Giao buổi sáng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class WebCreateOrderDeliveryDto {
  @ApiProperty({ example: 'self_pickup', enum: ['self_pickup', 'shop_delivery'] })
  @IsEnum(['self_pickup', 'shop_delivery'])
  method!: 'self_pickup' | 'shop_delivery';

  @ApiPropertyOptional({ example: '123 Đường 30/4, Ninh Kiều, Cần Thơ' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class WebCreateOrderReqDto {
  @ApiProperty({ type: WebCreateOrderCustomerDto })
  @ValidateNested()
  @Type(() => WebCreateOrderCustomerDto)
  customer!: WebCreateOrderCustomerDto;

  @ApiProperty({ example: '2026-09-20' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'pickupDate phải có định dạng YYYY-MM-DD.' })
  pickupDate!: string;

  @ApiProperty({ example: '2026-09-23' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate phải có định dạng YYYY-MM-DD.' })
  returnDate!: string;

  @ApiProperty({ type: [WebRentalItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WebRentalItemInputDto)
  items!: WebRentalItemInputDto[];

  @ApiProperty({ type: WebCreateOrderDeliveryDto })
  @ValidateNested()
  @Type(() => WebCreateOrderDeliveryDto)
  delivery!: WebCreateOrderDeliveryDto;

  @ApiProperty({ example: 'bank_transfer', enum: ['cash', 'bank_transfer', 'momo'] })
  @IsIn(['cash', 'bank_transfer', 'momo'])
  paymentMethod!: 'cash' | 'bank_transfer' | 'momo';
}

export class WebCreateOrderResDto {
  @ApiProperty({ example: 'KT260920-001' })
  orderCode!: string;

  @ApiProperty({ example: 480000 })
  totalAmount!: number;

  @ApiProperty({ example: 500000 })
  depositAmount!: number;

  @ApiProperty({ example: 'pending' })
  status!: string;
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

  @ApiProperty({ example: 0 })
  paidAmount!: number;

  @ApiProperty({ type: [WebOrderLookupItemDto] })
  items!: WebOrderLookupItemDto[];
}
