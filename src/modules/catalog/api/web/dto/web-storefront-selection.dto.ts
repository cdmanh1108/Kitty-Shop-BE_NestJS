import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const WEB_STOREFRONT_SELECTION_BATCH_LIMIT = 50;

export class WebStorefrontSelectionInputDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'ID sản phẩm dùng để xác nhận phân loại.' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ format: 'uuid', description: 'ID phân loại đã chọn cụ thể.' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class WebStorefrontSelectionResolveReqDto {
  @ApiProperty({
    type: [WebStorefrontSelectionInputDto],
    maxItems: WEB_STOREFRONT_SELECTION_BATCH_LIMIT,
    description: 'Các dòng giỏ cần resolve; thứ tự được giữ nguyên trong response.',
  })
  @IsArray()
  @ArrayMaxSize(WEB_STOREFRONT_SELECTION_BATCH_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => WebStorefrontSelectionInputDto)
  items!: WebStorefrontSelectionInputDto[];
}

export class WebStorefrontSelectionProductDto {
  @ApiProperty({ type: Boolean }) allowFreeAccessory!: boolean;
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'dam-da-hoi-trang' })
  slug!: string;

  @ApiProperty({ example: 'Đầm dạ hội trắng' })
  name!: string;
}

export class WebStorefrontSelectionVariantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'DAM-TRANG-M' })
  code!: string;

  @ApiProperty({ type: String, nullable: true, example: 'M' })
  size!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Trắng' })
  color!: string | null;
}

class WebStorefrontSelectionResolutionBaseDto {
  @ApiProperty({ example: 0, description: 'Chỉ số input để correlate với dòng giỏ.' })
  index!: number;

  @ApiProperty({ example: 1, description: 'Quantity được echo nguyên trạng; không phải tồn kho.' })
  quantity!: number;
}

export class WebResolvedStorefrontSelectionDto extends WebStorefrontSelectionResolutionBaseDto {
  @ApiProperty({ enum: ['RESOLVED'], example: 'RESOLVED' })
  status!: 'RESOLVED';

  @ApiProperty({ type: WebStorefrontSelectionProductDto })
  product!: WebStorefrontSelectionProductDto;

  @ApiProperty({ type: WebStorefrontSelectionVariantDto })
  variant!: WebStorefrontSelectionVariantDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.test/products/dam-m.jpg',
  })
  imageUrl!: string | null;
}

export class WebUnavailableStorefrontSelectionDto extends WebStorefrontSelectionResolutionBaseDto {
  @ApiProperty({ enum: ['UNAVAILABLE'], example: 'UNAVAILABLE' })
  status!: 'UNAVAILABLE';
}

export class WebStorefrontSelectionResolveResDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(WebResolvedStorefrontSelectionDto) },
        { $ref: getSchemaPath(WebUnavailableStorefrontSelectionDto) },
      ],
    },
  })
  items!: Array<
    | WebResolvedStorefrontSelectionDto
    | WebUnavailableStorefrontSelectionDto
  >;
}
