import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PRODUCT_KIND, type ProductKind } from '@modules/catalog/domain/product-kind';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const WEB_STOREFRONT_SELECTION_BATCH_LIMIT = 50;

export class WebStorefrontSelectionInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'ID sản phẩm; legacy alias chỉ resolve khi có đúng một biến thể storefront eligible.',
  })
  @ValidateIf((selection: WebStorefrontSelectionInputDto) => !selection.variantId)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ID biến thể đã chọn cụ thể.' })
  @ValidateIf((selection: WebStorefrontSelectionInputDto) => !selection.productId)
  @IsUUID()
  variantId?: string;

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
  @ApiProperty({ enum: Object.values(PRODUCT_KIND) }) kind!: ProductKind;
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

export class WebSelectionRequiredStorefrontSelectionDto extends WebStorefrontSelectionResolutionBaseDto {
  @ApiProperty({ enum: ['SELECTION_REQUIRED'], example: 'SELECTION_REQUIRED' })
  status!: 'SELECTION_REQUIRED';

  @ApiProperty({ type: WebStorefrontSelectionProductDto })
  product!: WebStorefrontSelectionProductDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.test/products/dam.jpg',
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
        { $ref: getSchemaPath(WebSelectionRequiredStorefrontSelectionDto) },
        { $ref: getSchemaPath(WebUnavailableStorefrontSelectionDto) },
      ],
    },
  })
  items!: Array<
    | WebResolvedStorefrontSelectionDto
    | WebSelectionRequiredStorefrontSelectionDto
    | WebUnavailableStorefrontSelectionDto
  >;
}
