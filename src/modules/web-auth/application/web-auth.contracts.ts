import type { WebProfile } from '../domain/web-auth.repository';

export interface CredentialsInput {
  email: string;
  password: string;
}

export interface ChallengeResult {
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface WebTokenResult {
  user: WebProfile;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface WebSessionContext {
  ipAddress?: string;
  userAgent?: string;
}
