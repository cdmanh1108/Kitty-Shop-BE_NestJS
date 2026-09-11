import { CUSTOMER_STATUS } from '@modules/customers/domain/customer-status';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { PaginationMetaResDto } from '@common/dto/response.dto';

export class CreateCustomerReqDto {
  @ApiProperty({ example: 'Nguyễn Thị A' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone!: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() facebook?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() zalo?: string;
  @ApiPropertyOptional({ example: '2000-01-30' }) @IsDateString() @IsOptional() birthday?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() gender?: string;
  @ApiPropertyOptional({ example: 'NORMAL' }) @IsString() @IsOptional() customerType?: string;
  @ApiPropertyOptional({ example: 'Facebook' }) @IsString() @IsOptional() source?: string;
}

export class UpdateCustomerReqDto extends PartialType(CreateCustomerReqDto) {
  @ApiPropertyOptional({ enum: Object.values(CUSTOMER_STATUS) })
  @IsIn(Object.values(CUSTOMER_STATUS))
  @IsOptional()
  status?: string;
}

export class CustomerListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() status?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() customerType?: string;
}

export class AddCustomerNoteReqDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isPinned = false;
}

export class CustomerResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) facebook!: string | null;
  @ApiPropertyOptional({ nullable: true }) zalo!: string | null;
  @ApiProperty() customerType!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
}

export class CustomerAddressReqDto {
  @ApiPropertyOptional() @IsString() @IsOptional() label?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() recipientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiProperty() @IsString() @MinLength(1) addressLine!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() ward?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() district?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() province?: string;
  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isDefault = false;
}

export class UpdateCustomerAddressReqDto extends PartialType(CustomerAddressReqDto) {}

export class CustomerStatsResDto {
  @ApiProperty() totalOrders!: number;
  @ApiProperty() completedOrders!: number;
  @ApiProperty({ example: 2500000 }) totalPaid!: number;
  @ApiProperty({ example: 1000000 }) depositHeld!: number;
}

export class CustomerDetailResDto extends CustomerResDto {
  @ApiProperty({ type: [Object] }) addresses!: object[];
  @ApiProperty({ type: [Object] }) notes!: object[];
  @ApiProperty({ type: [Object] }) tags!: object[];
  @ApiProperty({ type: CustomerStatsResDto }) stats!: CustomerStatsResDto;
  @ApiProperty({ type: [Object] }) recentOrders!: object[];
}

export class CustomerPageResDto {
  @ApiProperty({ type: [CustomerResDto] }) items!: CustomerResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
