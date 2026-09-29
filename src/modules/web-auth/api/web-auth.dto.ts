import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { normalizeWebEmail } from '../domain/email';

export class WebEmailDto {
  @ApiProperty({ format: 'email', example: 'user@example.com', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizeWebEmail(value) ?? value) : value,
  )
  @IsEmail({ allow_utf8_local_part: false }, { message: 'A valid email address is required.' })
  @MaxLength(254)
  email!: string;
}

export class WebCredentialsDto extends WebEmailDto {
  @ApiProperty({
    minLength: 8,
    maxLength: 64,
    format: 'password',
    description: '8-64 characters, at most 72 UTF-8 bytes',
  })
  @IsString({ message: 'Password must be a string.' })
  @Length(8, 64, { message: 'Password must be 8 to 64 characters long.' })
  password!: string;
}

export class WebVerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Invalid verification request.' })
  challengeId!: string;
  @ApiProperty({ pattern: '^\\d{6}$', minLength: 6, maxLength: 6 })
  @IsString({ message: 'Verification code must be a string.' })
  @MaxLength(6, { message: 'Verification code must contain six digits.' })
  @Matches(/^\d{6}$/, { message: 'Verification code must contain six digits.' })
  otp!: string;
}

export class WebResendOtpDto {
  @ApiProperty({ format: 'uuid', description: 'The current registration verification challenge.' })
  @IsUUID('4', { message: 'Invalid verification request.' })
  challengeId!: string;
}

export class WebChallengeDto {
  @ApiProperty({ format: 'uuid' }) challengeId!: string;
  @ApiProperty({ format: 'email', example: 'user@example.com' }) email!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'date-time' }) resendAvailableAt!: string;
}

export class WebProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    format: 'email',
    nullable: true,
    type: String,
    description: 'Null only for retained accounts created before email identity migration.',
  })
  email!: string | null;
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Null only for unverified or retained pre-migration accounts.',
  })
  emailVerifiedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class WebVerifiedDto {
  @ApiProperty({ enum: [true] }) verified!: boolean;
}
export class WebLogoutDto {
  @ApiProperty({ enum: [true] }) success!: boolean;
}
