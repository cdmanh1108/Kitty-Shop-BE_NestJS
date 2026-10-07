import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import type { WebAccountVerification } from '../domain/admin-web-account-reader';

export class AdminWebAccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @IsString({ message: 'Từ khóa phải là chuỗi ký tự.' })
  @MaxLength(254, { message: 'Từ khóa tối đa 254 ký tự.' })
  search?: string;

  @ApiPropertyOptional({ enum: ['verified', 'unverified'] })
  @IsOptional()
  @IsIn(['verified', 'unverified'], { message: 'Trạng thái xác thực không hợp lệ.' })
  verification?: WebAccountVerification;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Tài khoản từng đặt đơn cho khách hàng này.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'Mã khách hàng phải là UUID hợp lệ.' })
  customerId?: string;
}

export class AdminWebAccountResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) emailVerifiedAt!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) disabledAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({
    minimum: 0,
    description: 'Số đơn thuộc tài khoản trong cửa hàng hiện tại, gồm mọi trạng thái.',
  })
  rentalOrderCount!: number;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Thời điểm đặt đơn gần nhất.',
  })
  lastRentalAt!: string | null;
}

export class AdminWebAccountPageResDto {
  @ApiProperty({ type: [AdminWebAccountResDto] }) items!: AdminWebAccountResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
