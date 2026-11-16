import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

export async function createVerifiedWebAccount(
  prisma: PrismaService,
  email = `web-${randomUUID()}@example.test`,
) {
  return prisma.webAccount.create({
    data: { email, passwordHash: 'test-only-unused', emailVerifiedAt: new Date() },
  });
}

export function webAccessCookie(accountId: string): string {
  const token = new JwtService({ secret: process.env.WEB_JWT_ACCESS_SECRET }).sign(
    { sub: accountId, surface: 'web' },
    { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn: 900 },
  );
  return `kitty_web_access=${token}`;
}
