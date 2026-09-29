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
export type ChallengeIssueIntent =
  | {
      kind: 'register';
      phone: string;
      passwordHash: string;
      attemptId: string;
    }
  | { kind: 'resend'; challengeId: string };
export type ChallengeIssueRequest = ChallengeIssueIntent & {
  challenge: NewChallenge;
  now: Date;
};
export type ChallengeIssueResult =
  | { challenge: OtpChallenge; phone: string }
  | {
      error:
        | 'OTP_CHALLENGE_NOT_FOUND'
        | 'OTP_CONSUMED'
        | 'OTP_RESEND_TOO_SOON'
        | 'PHONE_ALREADY_REGISTERED'
        | 'PHONE_ALREADY_VERIFIED'
        | 'ACCOUNT_DISABLED';
    };
export type ChallengeIssuePersistenceResult =
  | { challenge: OtpChallenge }
  | { error: 'OTP_RESEND_TOO_SOON' };
export interface WebRefreshTokenData {
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}
export type WebRefreshRotationResult =
  | { outcome: 'ROTATED'; account: WebAccount }
  | { outcome: 'REUSED' | 'REJECTED' | 'CONCURRENT' };
export interface WebAuthRepository {
  issueVerificationChallenge(request: ChallengeIssueRequest): Promise<ChallengeIssueResult>;
  findAccount(phone: string): Promise<WebAccount | null>;
  findChallenge(id: string): Promise<OtpChallenge | null>;
  verify(id: string, otpHash: string, now: Date, maxAttempts: number): Promise<VerifyResult>;
  findAccountById(id: string): Promise<WebAccount | null>;
  createRefreshToken(
    input: WebRefreshTokenData & { accountId: string; familyId: string },
  ): Promise<boolean>;
  rotateRefreshToken(
    tokenHash: string,
    replacement: WebRefreshTokenData,
    now: Date,
  ): Promise<WebRefreshRotationResult>;
  revokeRefreshToken(tokenHash: string, now: Date): Promise<void>;
}
