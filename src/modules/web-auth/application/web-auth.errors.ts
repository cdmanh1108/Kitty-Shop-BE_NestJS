import { HttpException } from '@nestjs/common';

const messages: Record<string, string> = {
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_PASSWORD: 'Password must be 8 to 64 characters and at most 72 UTF-8 bytes.',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered. Please sign in to continue.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_NOT_VERIFIED: 'This account email has not been verified.',
  ACCOUNT_DISABLED: 'This account is disabled.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  OTP_CHALLENGE_NOT_FOUND: 'Verification request not found. Please request a new code.',
  OTP_EXPIRED: 'Verification code expired. Please request a new code.',
  OTP_ATTEMPTS_EXCEEDED: 'Too many attempts. Please request a new code.',
  OTP_CONSUMED: 'Verification code was already used. Please request a new code.',
  OTP_INVALID: 'Verification code is incorrect.',
  OTP_RESEND_TOO_SOON: 'Please wait before requesting another verification code.',
  EMAIL_ALREADY_VERIFIED: 'This email is already verified. Please sign in.',
};

export function authError(code: string, status = 400): never {
  throw new HttpException(
    { code, message: messages[code] ?? 'Could not complete the request.' },
    status,
  );
}
