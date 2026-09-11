import type { CurrentUser } from '@common/types/current-user';
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
  shopCode?: string;
}

export interface LoginResult {
  user: CurrentUser;
  tokens: AuthTokensResult;
}

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
