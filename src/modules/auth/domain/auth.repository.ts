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

export interface StoredRefreshToken {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  identity: AuthIdentity;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthRepository {
  findIdentityByEmail(email: string, shopCode?: string): Promise<AuthIdentity | null>;
  consumeRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null>;
  createRefreshToken(input: {
    userId: string;
    memberId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;
  revokeRefreshToken(tokenHash: string): Promise<void>;
  updateLastLogin(userId: string): Promise<void>;
  findPasswordHash(userId: string, memberId: string, shopId: string): Promise<string | null>;
  updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void>;
}
