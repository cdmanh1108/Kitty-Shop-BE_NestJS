import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginReqDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail(undefined, { message: 'Email không hợp lệ.' })
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất $constraint1 ký tự.' })
  password!: string;

  @ApiPropertyOptional({
    example: 'MAIN',
    description: 'Optional when a user belongs to one shop.',
  })
  @IsString({ message: 'Mã cửa hàng phải là chuỗi ký tự.' })
  @IsOptional()
  shopCode?: string;
}

export class RefreshTokenReqDto {
  @ApiProperty()
  @IsString({ message: 'Mã làm mới phiên đăng nhập phải là chuỗi ký tự.' })
  @MinLength(32, { message: 'Mã làm mới phiên đăng nhập phải có ít nhất $constraint1 ký tự.' })
  refreshToken!: string;
}

export class AuthUserResDto {
  @ApiProperty() userId!: string;
  @ApiProperty() memberId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class AuthTokensResDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 900 }) expiresIn!: number;
}

export class LoginResDto {
  @ApiProperty({ type: AuthUserResDto }) user!: AuthUserResDto;
  @ApiProperty({ type: AuthTokensResDto }) tokens!: AuthTokensResDto;
}

export class ChangePasswordReqDto {
  @ApiProperty()
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự.' })
  @MinLength(8, { message: 'Mật khẩu hiện tại phải có ít nhất $constraint1 ký tự.' })
  currentPassword!: string;

  @ApiProperty({ minLength: 12, description: 'Use a unique passphrase/password for production.' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự.' })
  @MinLength(12, { message: 'Mật khẩu mới phải có ít nhất $constraint1 ký tự.' })
  newPassword!: string;
}
