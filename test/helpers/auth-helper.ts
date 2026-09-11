import { JwtService } from '@nestjs/jwt';

const secret = 'kitty-test-only-signing-key-never-for-deployment';

const jwtService = new JwtService({ secret });

export function generateTestAccessToken(payload: {
  userId: string;
  memberId: string;
  shopId: string;
}): string {
  return jwtService.sign(
    { sub: payload.userId, mid: payload.memberId, sid: payload.shopId },
    { algorithm: 'HS256', expiresIn: 900 },
  );
}
