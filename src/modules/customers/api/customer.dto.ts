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
  @IsString({ message: 'Họ tên phải là chuỗi ký tự.' })
  @MinLength(1, { message: 'Họ tên phải có ít nhất $constraint1 ký tự.' })
  @MaxLength(255, { message: 'Họ tên không được vượt quá $constraint1 ký tự.' })
  fullName!: string;

  @ApiProperty({ example: '0901234567' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  @MinLength(8, { message: 'Số điện thoại phải có ít nhất $constraint1 ký tự.' })
  @MaxLength(30, { message: 'Số điện thoại không được vượt quá $constraint1 ký tự.' })
  phone!: string;

  @ApiPropertyOptional()
  @IsEmail(undefined, { message: 'Email không hợp lệ.' })
  @IsOptional()
  email?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Facebook phải là chuỗi ký tự.' })
  @IsOptional()
  facebook?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Zalo phải là chuỗi ký tự.' })
  @IsOptional()
  zalo?: string;
  @ApiPropertyOptional({ example: '2000-01-30' })
  @IsDateString(undefined, {
    message: 'Ngày sinh phải là ngày giờ hợp lệ theo định dạng ISO 8601.',
  })
  @IsOptional()
  birthday?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Giới tính phải là chuỗi ký tự.' })
  @IsOptional()
  gender?: string;
  @ApiPropertyOptional({ example: 'NORMAL' })
  @IsString({ message: 'Loại khách hàng phải là chuỗi ký tự.' })
  @IsOptional()
  customerType?: string;
  @ApiPropertyOptional({ example: 'Facebook' })
  @IsString({ message: 'Nguồn khách hàng phải là chuỗi ký tự.' })
  @IsOptional()
  source?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @MaxLength(2000, { message: 'Ghi chú không được vượt quá $constraint1 ký tự.' })
  @IsOptional()
  note?: string;
}

export class UpdateCustomerReqDto extends PartialType(CreateCustomerReqDto) {
  @ApiPropertyOptional({ enum: Object.values(CUSTOMER_STATUS) })
  @IsIn(Object.values(CUSTOMER_STATUS), { message: 'Trạng thái không hợp lệ.' })
  @IsOptional()
  status?: string;
}

export class CustomerListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Trạng thái phải là chuỗi ký tự.' })
  @IsOptional()
  status?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Loại khách hàng phải là chuỗi ký tự.' })
  @IsOptional()
  customerType?: string;
}

export class CustomerLookupQueryDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @IsOptional()
  search?: string;
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt({ message: 'Số kết quả mỗi trang phải là số nguyên.' })
  @Min(1, { message: 'Số kết quả mỗi trang phải lớn hơn hoặc bằng $constraint1.' })
  @Max(20, { message: 'Số kết quả mỗi trang phải nhỏ hơn hoặc bằng $constraint1.' })
  @IsOptional()
  limit?: number;
}

export class AddCustomerNoteReqDto {
  @ApiProperty()
  @IsString({ message: 'Nội dung phải là chuỗi ký tự.' })
  @MinLength(1, { message: 'Nội dung phải có ít nhất $constraint1 ký tự.' })
  content!: string;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @Type(() => Boolean)
  @IsBoolean({ message: 'Tùy chọn ghim ghi chú phải là giá trị đúng hoặc sai.' })
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

export class CustomerListItemResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) facebook!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) zalo!: string | null;
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
  @ApiPropertyOptional()
  @IsString({ message: 'Nhãn địa chỉ phải là chuỗi ký tự.' })
  @IsOptional()
  label?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tên người nhận phải là chuỗi ký tự.' })
  @IsOptional()
  recipientName?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  @IsOptional()
  phone?: string;
  @ApiProperty()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' })
  @MinLength(1, { message: 'Địa chỉ phải có ít nhất $constraint1 ký tự.' })
  addressLine!: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Phường/xã phải là chuỗi ký tự.' })
  @IsOptional()
  ward?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Quận/huyện phải là chuỗi ký tự.' })
  @IsOptional()
  district?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Thành phố phải là chuỗi ký tự.' })
  @IsOptional()
  city?: string;
  @ApiPropertyOptional()
  @IsString({ message: 'Tỉnh/thành phải là chuỗi ký tự.' })
  @IsOptional()
  province?: string;
  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean({ message: 'Tùy chọn địa chỉ mặc định phải là giá trị đúng hoặc sai.' })
  @IsOptional()
  isDefault = false;
}

export class UpdateCustomerAddressReqDto extends PartialType(CustomerAddressReqDto) {}

export class CustomerStatsResDto {
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

export class CustomerDetailAddressResDto {
  @ApiProperty() id!: string;
  @ApiProperty() addressLine!: string;
  @ApiProperty() isDefault!: boolean;
}

export class CustomerDetailNoteResDto {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
}

export class CustomerDetailResDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerCode!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) facebook!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) zalo!: string | null;
  @ApiProperty({ type: [CustomerDetailAddressResDto] }) addresses!: CustomerDetailAddressResDto[];
  @ApiProperty({ type: [CustomerDetailNoteResDto] }) notes!: CustomerDetailNoteResDto[];
  @ApiProperty({ type: CustomerStatsResDto }) stats!: CustomerStatsResDto;
}

export class CustomerPageResDto {
  @ApiProperty({ type: [CustomerListItemResDto] }) items!: CustomerListItemResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
