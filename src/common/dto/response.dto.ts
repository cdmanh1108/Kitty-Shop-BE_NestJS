import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaResDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class DeleteResDto {
  @ApiProperty({ example: true }) deleted!: boolean;
}

export class ErrorResDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'HTTP_400' }) code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ nullable: true, type: Object }) details?: object | null;
  @ApiPropertyOptional() requestId?: string;
  @ApiProperty() path!: string;
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
}
