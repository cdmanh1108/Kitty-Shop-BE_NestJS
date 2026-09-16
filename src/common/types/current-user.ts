export interface CurrentUser {
  userId: string;
  memberId: string;
  shopId: string;
  email: string | null;
  fullName: string;
  permissions: string[];
}

export interface JwtAccessPayload {
  sub: string;
  mid: string;
  sid: string;
  surface: 'admin';
}
