export interface AuthCleanupRepository {
  purgeAdminRefreshTokenFamilies(cutoff: Date, limit: number): Promise<number>;
  purgeWebRefreshTokenFamilies(cutoff: Date, limit: number): Promise<number>;
  purgeWebOtpChallenges(cutoff: Date, limit: number): Promise<number>;
}

export const AUTH_CLEANUP_REPOSITORY = Symbol('AUTH_CLEANUP_REPOSITORY');
