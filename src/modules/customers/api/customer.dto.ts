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
  IsInt,
  Max,
  Min,
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
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() note?: string;
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

export class CustomerLookupQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number;
}

export class AddCustomerNoteReqDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}

export class CustomerResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) facebook!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) zalo!: string | null;
  @ApiProperty() customerType!: string;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CustomerListItemResDto extends CustomerResDto {
  @ApiProperty() completedRentalCount!: number;
  @ApiProperty({ example: 2500000 }) totalPaid!: number;
  @ApiPropertyOptional({ nullable: true, type: Date }) lastRentalAt!: Date | null;
}

export class CustomerLookupItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
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
  @ApiProperty() completedRentalCount!: number;
  @ApiProperty({ example: 2500000 }) totalPaid!: number;
  @ApiProperty({ example: 1000000 }) depositHeld!: number;
  @ApiPropertyOptional({ nullable: true, type: Date }) lastRentalAt!: Date | null;
}

export class CustomerAddressResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) label!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) recipientName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty() addressLine!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) ward!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) district!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) city!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) province!: string | null;
  @ApiProperty() country!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CustomerNoteResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() content!: string;
  @ApiProperty() isPinned!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) createdBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CustomerTagResDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) color!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class CustomerOrderSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() rentalStartAt!: Date;
  @ApiProperty() rentalEndAt!: Date;
  @ApiProperty() status!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty({ type: String, example: '1500000.00' }) grandTotal!: string;
}

export class CustomerDetailResDto extends CustomerResDto {
  @ApiProperty({ type: [CustomerAddressResDto] }) addresses!: CustomerAddressResDto[];
  @ApiProperty({ type: [CustomerNoteResDto] }) notes!: CustomerNoteResDto[];
  @ApiProperty({ type: [CustomerTagResDto] }) tags!: CustomerTagResDto[];
  @ApiProperty({ type: CustomerStatsResDto }) stats!: CustomerStatsResDto;
  @ApiProperty({ type: [CustomerOrderSummaryResDto] }) recentOrders!: CustomerOrderSummaryResDto[];
}

export class CustomerPageResDto {
  @ApiProperty({ type: [CustomerListItemResDto] }) items!: CustomerListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
