import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class WebPhoneDto {
  @ApiProperty({ example: '0912345678', maxLength: 40 })
  @IsString({ message: 'Số điện thoại phải là chuỗi.' })
  @Length(10, 40, { message: 'Số điện thoại không hợp lệ.' })
  phone!: string;
}
export class WebCredentialsDto extends WebPhoneDto {
  @ApiProperty({
    minLength: 8,
    maxLength: 64,
    format: 'password',
    description: '8–64 characters, at most 72 UTF-8 bytes',
  })
  @IsString({ message: 'Mật khẩu phải là chuỗi.' })
  @Length(8, 64, { message: 'Mật khẩu cần từ 8 đến 64 ký tự.' })
  password!: string;
}
export class WebVerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Yêu cầu xác thực không hợp lệ.' })
  challengeId!: string;
  @ApiProperty({ pattern: '^\\d{6}$', minLength: 6, maxLength: 6 })
  @IsString({ message: 'Mã xác thực phải là chuỗi.' })
  @MaxLength(6, { message: 'Mã xác thực cần đúng 6 chữ số.' })
  @Matches(/^\d{6}$/, { message: 'Mã xác thực cần đúng 6 chữ số.' })
  otp!: string;
}
export class WebChallengeDto {
  @ApiProperty({ format: 'uuid' }) challengeId!: string;
  @ApiProperty({ example: '+84912345678' }) phone!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'date-time' }) resendAvailableAt!: string;
}
export class WebProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '+84912345678' }) phone!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) phoneVerifiedAt!:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class WebVerifiedDto {
  @ApiProperty({ enum: [true] }) verified!: boolean;
}
export class WebLogoutDto {
  @ApiProperty({ enum: [true] }) success!: boolean;
}
