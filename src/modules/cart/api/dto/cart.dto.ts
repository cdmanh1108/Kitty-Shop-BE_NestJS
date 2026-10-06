import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  RENTAL_BILLING_ROLE,
  type RentalBillingRole,
} from '@modules/rentals/public/rental-billing-role';
import { CART_MAX_ITEM_COUNT, CART_MAX_QUANTITY_PER_ITEM } from '../../application/cart.service';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CartItemDto {
  @ApiPropertyOptional({
    enum: Object.values(RENTAL_BILLING_ROLE),
    description: 'Bỏ qua để thuê có phí; FREE_ACCESSORY là phụ kiện thuê kèm miễn phí.',
  })
  @IsOptional()
  @IsIn(Object.values(RENTAL_BILLING_ROLE))
  billingRole?: RentalBillingRole;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: CART_MAX_QUANTITY_PER_ITEM })
  @IsInt()
  @Min(1)
  @Max(CART_MAX_QUANTITY_PER_ITEM)
  quantity!: number;
}

export class CartDraftDto {
  @ApiProperty({ example: '2026-10-01', format: 'date' })
  @Matches(DATE_ONLY)
  pickupDate!: string;

  @ApiProperty({ example: '2026-10-03', format: 'date' })
  @Matches(DATE_ONLY)
  returnDate!: string;

  @ApiProperty({ type: [CartItemDto], maxItems: CART_MAX_ITEM_COUNT })
  @IsArray()
  @ArrayMaxSize(CART_MAX_ITEM_COUNT)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}

export class CartReplaceReqDto extends CartDraftDto {
  @ApiProperty({
    minimum: 0,
    description: 'Phiên bản giỏ hiện tại; 0 khi tài khoản chưa có giỏ trên server.',
  })
  @IsInt()
  @Min(0)
  version!: number;
}

export class CartDto extends CartDraftDto {
  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class CartGetResDto {
  @ApiProperty({ type: CartDto, nullable: true })
  cart!: CartDto | null;
}
