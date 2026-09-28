import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class FavoritesListQueryDto extends PaginationQueryDto {}

export class FavoritesStatusQueryDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    required: false,
    description: 'Danh sách ID sản phẩm, phân cách bằng dấu phẩy.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.length ? value.split(',').filter(Boolean) : [],
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  productIds: string[] = [];
}

export class FavoritesStatusResDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  productIds!: string[];

  @ApiProperty({ example: 3 })
  total!: number;
}

export class FavoriteSummaryResDto {
  @ApiProperty({ example: 3 })
  total!: number;
}

export class FavoriteMutationResDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: true })
  isFavorite!: boolean;

  @ApiProperty({ example: 3 })
  total!: number;
}
