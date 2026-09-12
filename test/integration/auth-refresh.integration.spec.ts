import { createHash } from 'node:crypto';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestShop, createTestUserAndMember, TEST_PASSWORD } from '../fixtures/test-factories';
import { PrismaAuthRepository } from '../../src/modules/auth/infrastructure/prisma-auth.repository';
import { AuthService } from '../../src/modules/auth/application/auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { AppConfiguration } from '../../src/config/configuration';

describe('Auth Refresh Rotation & Concurrent Security Integration', () => {
  let prisma: PrismaService;
  let authRepo: PrismaAuthRepository;
  let authService: AuthService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    authRepo = new PrismaAuthRepository(prisma);

    const jwtService = new JwtService({
      secret:
        '2272ad6b853ac16039b4bac8100edebf73bfeb7c5ef4b5ce1659778b0ed1bdd573bf232131d27435e00f0ac03adf7a3d',
    });

    const testConfig: AppConfiguration = {
      nodeEnv: 'test',
      port: 3000,
      apiPrefix: 'api/v1',
      appName: 'Rental Shop API',
      appUrl: 'http://localhost:3000',
      corsOrigins: [],
      trustProxy: false,
      swaggerEnabled: false,
      jwtAccessSecret:
        '2272ad6b853ac16039b4bac8100edebf73bfeb7c5ef4b5ce1659778b0ed1bdd573bf232131d27435e00f0ac03adf7a3d',
      jwtAccessTtlSeconds: 900,
      refreshTokenTtlDays: 7,
      rateLimitTtlMs: 60000,
      rateLimitLimit: 100,
      objectStorage: {
        provider: 's3',
        endpoint: '',
        region: 'auto',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        publicBaseUrl: '',
      },
    };
    const configService = new ConfigService<AppConfiguration, true>(testConfig);

    authService = new AuthService(authRepo, jwtService, configService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('rotates refresh token: old token is revoked and replacement token is issued', async () => {
    const shop = await createTestShop(prisma);
    const { user } = await createTestUserAndMember(prisma, shop.id);
    const email = user.email!;

    // 1. Initial login -> issues Session A (AccessToken A + RefreshToken A)
    const loginResult = await authService.login(
      { email, password: TEST_PASSWORD, shopCode: shop.code },
      { ipAddress: '127.0.0.1', userAgent: 'Jest-Test' },
    );
    expect(loginResult.tokens.accessToken).toBeDefined();
    expect(loginResult.tokens.refreshToken).toBeDefined();
    const tokenA = loginResult.tokens.refreshToken;

    // 2. Refresh with Token A -> issues Session B (RefreshToken B)
    const refreshResult = await authService.refresh(tokenA, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest-Test',
    });
    expect(refreshResult.tokens.accessToken).toBeDefined();
    expect(refreshResult.tokens.refreshToken).toBeDefined();
    expect(refreshResult.tokens.refreshToken).not.toBe(tokenA);
    const tokenB = refreshResult.tokens.refreshToken;

    // 3. Attempt to reuse Token A -> MUST fail with UnauthorizedException (consumed/revoked)
    await expect(
      authService.refresh(tokenA, { ipAddress: '127.0.0.1', userAgent: 'Jest-Test' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid or expired refresh token'));

    // 4. Token B is still valid and can be refreshed
    const secondRefresh = await authService.refresh(tokenB, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest-Test',
    });
    expect(secondRefresh.tokens.refreshToken).not.toBe(tokenB);
  });

  it('guarantees at most one successful rotation under concurrent refresh race with same token', async () => {
    const shop = await createTestShop(prisma);
    const { user } = await createTestUserAndMember(prisma, shop.id);
    const email = user.email!;

    const loginResult = await authService.login(
      { email, password: TEST_PASSWORD, shopCode: shop.code },
      { ipAddress: '127.0.0.1', userAgent: 'Jest-Test' },
    );
    const tokenA = loginResult.tokens.refreshToken;

    // Concurrently trigger two refresh requests using the exact same Token A
    const [res1, res2] = await Promise.allSettled([
      authService.refresh(tokenA, { ipAddress: '127.0.0.1', userAgent: 'Jest-Client-1' }),
      authService.refresh(tokenA, { ipAddress: '127.0.0.1', userAgent: 'Jest-Client-2' }),
    ]);

    type RefreshResult = Awaited<ReturnType<AuthService['refresh']>>;
    const fulfilled = [res1, res2].filter(
      (r): r is PromiseFulfilledResult<RefreshResult> => r.status === 'fulfilled',
    );
    const rejected = [res1, res2].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    // Exactly one must succeed and exactly one must fail with 401
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(UnauthorizedException);

    // In the database, the winner's replacement token exists and tokenA is marked revoked
    const winnerToken = fulfilled[0]!.value.tokens.refreshToken;
    expect(winnerToken).toBeDefined();
    expect(winnerToken).not.toBe(tokenA);
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
    expect(rows.map((row) => row.tokenHash)).toContain(
      createHash('sha256').update(winnerToken).digest('hex'),
    );
    expect(JSON.stringify(rows)).not.toContain(winnerToken);
    await expect(authService.refresh(winnerToken, {})).resolves.toBeTruthy();
  });

  it('revokes refresh token on logout and rejects subsequent refresh attempts', async () => {
    const shop = await createTestShop(prisma);
    const { user, member } = await createTestUserAndMember(prisma, shop.id);
    const email = user.email!;

    const loginResult = await authService.login(
      { email, password: TEST_PASSWORD, shopCode: shop.code },
      { ipAddress: '127.0.0.1', userAgent: 'Jest-Test' },
    );
    const token = loginResult.tokens.refreshToken;

    const currentUser: CurrentUser = {
      userId: user.id,
      memberId: member.id,
      shopId: shop.id,
      email: user.email,
      fullName: user.fullName,
      permissions: ['*'],
    };

    // Logout
    await authService.logout(currentUser, token);

    // Subsequent refresh must be rejected
    await expect(
      authService.refresh(token, { ipAddress: '127.0.0.1', userAgent: 'Jest-Test' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid or expired refresh token'));
  });
  it('does not consume the old token when replacement persistence fails inside the transaction', async () => {
    const shop = await createTestShop(prisma);
    const { user } = await createTestUserAndMember(prisma, shop.id);
    if (!user.email) throw new Error('Missing fixture email');
    const session = await authService.login({ email: user.email, password: TEST_PASSWORD }, {});
    const digest = createHash('sha256').update(session.tokens.refreshToken).digest('hex');
    const row = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: digest } });
    // Duplicate unique hash fails after conditional consumption, inside the real transaction.
    await expect(
      authRepo.rotateRefreshToken(digest, { tokenHash: digest, expiresAt: row.expiresAt }),
    ).rejects.toThrow();
    expect(
      (await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: digest } })).revokedAt,
    ).toBeNull();
    await expect(authService.refresh(session.tokens.refreshToken, {})).resolves.toBeTruthy();
  });

  it('rejects expired stored tokens without inserting replacements', async () => {
    const shop = await createTestShop(prisma);
    const { user } = await createTestUserAndMember(prisma, shop.id);
    if (!user.email) throw new Error('Missing fixture email');
    const session = await authService.login({ email: user.email, password: TEST_PASSWORD }, {});
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date('2000-01-01T00:00:00Z') } });
    await expect(authService.refresh(session.tokens.refreshToken, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(await prisma.refreshToken.count()).toBe(1);
  });
});
