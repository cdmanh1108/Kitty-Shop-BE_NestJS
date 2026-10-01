import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateColorReqDto {
  @ApiProperty({
    example: ' red ',
    description:
      'Được trim rồi chuyển thành chữ in hoa; mã sau chuẩn hóa chỉ gồm A-Z, 0-9, dấu gạch dưới và tối đa 50 ký tự.',
  })
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  code!: string;
  @ApiProperty({
    example: ' Đỏ đô ',
    description:
      'Khoảng trắng đầu/cuối sẽ được loại bỏ; tên sau chuẩn hóa không rỗng và tối đa 100 ký tự.',
  })
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  name!: string;
  @ApiPropertyOptional({
    example: '#000000',
    description: 'Để trống tương đương null; nếu có giá trị thì phải theo dạng #RRGGBB.',
  })
  @IsString({ message: 'Mã màu phải là chuỗi ký tự.' })
  @IsOptional()
  hexColor?: string;
}

export class ColorSummaryResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hexColor!: string | null;
}

export class UpdateColorReqDto {
  @ApiPropertyOptional({
    example: ' red ',
    description:
      'Được trim rồi chuyển thành chữ in hoa; mã sau chuẩn hóa chỉ gồm A-Z, 0-9, dấu gạch dưới và tối đa 50 ký tự.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Mã phải là chuỗi ký tự.' })
  code?: string;

  @ApiPropertyOptional({
    example: ' Đỏ đô ',
    description:
      'Khoảng trắng đầu/cuối sẽ được loại bỏ; tên sau chuẩn hóa không rỗng và tối đa 100 ký tự.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên không được để trống.' })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '#ff00aa',
    description: 'Bỏ trường này để giữ nguyên; gửi null hoặc chuỗi rỗng để xóa mã màu.',
  })
  @IsString({ message: 'Mã màu phải là chuỗi ký tự.' })
  @IsOptional()
  hexColor?: string | null;
}

export class UpdateColorStatusReqDto {
  @ApiProperty({ description: 'Bật hoặc ngừng sử dụng màu.' })
  @IsBoolean({ message: 'isActive phải là giá trị đúng hoặc sai.' })
  isActive!: boolean;
}

export class ColorManagementResDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) hexColor!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class ColorManagementPageResDto {
  @ApiProperty({ type: [ColorManagementResDto] }) items!: ColorManagementResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
