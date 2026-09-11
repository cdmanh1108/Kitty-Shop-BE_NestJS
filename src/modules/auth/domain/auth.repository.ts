export interface AuthIdentity {
  userId: string;
  memberId: string;
  shopId: string;
  email: string | null;
  fullName: string;
  passwordHash: string | null;
  userStatus: string;
  memberStatus: string;
  permissions: string[];
}

export interface RefreshTokenData {
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateRefreshTokenData extends RefreshTokenData {
  userId: string;
  memberId: string;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthRepository {
  findIdentityByEmail(email: string, shopCode?: string): Promise<AuthIdentity | null>;
  rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenData,
  ): Promise<AuthIdentity | null>;
  createRefreshToken(input: CreateRefreshTokenData): Promise<void>;
  revokeRefreshToken(tokenHash: string, userId: string, memberId: string): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
  findPasswordHash(userId: string, memberId: string, shopId: string): Promise<string | null>;
  updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void>;
}
