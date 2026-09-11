import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginReqDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: 'MAIN',
    description: 'Optional when a user belongs to one shop.',
  })
  @IsString()
  @IsOptional()
  shopCode?: string;
}

export class RefreshTokenReqDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
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
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, description: 'Use a unique passphrase/password for production.' })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}
