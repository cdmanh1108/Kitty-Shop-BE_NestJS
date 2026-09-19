export const WEB_AUTH_REPOSITORY = Symbol('WEB_AUTH_REPOSITORY');
export interface WebAccount {
  id: string;
  phone: string;
  passwordHash: string;
  pendingPasswordHash?: string | null;
  registrationAttemptId?: string | null;
  phoneVerifiedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
}
export interface WebProfile {
  id: string;
  phone: string;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
}
export interface OtpChallenge {
  id: string;
  accountId: string;
  registrationAttemptId?: string | null;
  otpHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  attemptCount: number;
  consumedAt: Date | null;
  createdAt: Date;
}
export type NewChallenge = Omit<OtpChallenge, 'accountId' | 'attemptCount' | 'consumedAt'>;
export type OtpFailure =
  | 'OTP_CHALLENGE_NOT_FOUND'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'OTP_CONSUMED'
  | 'OTP_INVALID'
  | 'ACCOUNT_DISABLED';
export type VerifyResult = { verified: true } | { error: OtpFailure };
export type ResendResult =
  | { challenge: OtpChallenge }
  | {
      error:
        | 'OTP_CHALLENGE_NOT_FOUND'
        | 'OTP_RESEND_TOO_SOON'
        | 'PHONE_ALREADY_VERIFIED'
        | 'ACCOUNT_DISABLED';
    };
export class PhoneAlreadyRegisteredError extends Error {}
export interface WebRefreshTokenData {
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}
export interface WebAuthRepository {
  register(phone: string, passwordHash: string, attemptId: string, challenge: NewChallenge): Promise<OtpChallenge>;
  findAccount(phone: string): Promise<WebAccount | null>;
  findChallenge(id: string): Promise<OtpChallenge | null>;
  verify(id: string, otpHash: string, now: Date, maxAttempts: number): Promise<VerifyResult>;
  resend(phone: string, challenge: NewChallenge, now: Date): Promise<ResendResult>;
  findAccountById(id: string): Promise<WebAccount | null>;
  createRefreshToken(input: WebRefreshTokenData & { accountId: string }): Promise<boolean>;
  rotateRefreshToken(
    tokenHash: string,
    replacement: WebRefreshTokenData,
    now: Date,
  ): Promise<WebAccount | null>;
  revokeRefreshToken(tokenHash: string, now: Date): Promise<void>;
}
