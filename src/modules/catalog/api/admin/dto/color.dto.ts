import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
