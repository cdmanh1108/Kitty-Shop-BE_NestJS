import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import type { WebAuthRepository } from '../../src/modules/web-auth/domain/web-auth.repository';
import { WebAuthApplicationError } from '../../src/modules/web-auth/domain/web-auth.errors';
import {
  now,
  sessionService,
  testAccount,
  testJwt,
  webAuthRepository,
} from './web-auth-test-fixtures';

describe('WebSessionService', () => {
  it('normalizes email, verifies a password, and creates a hashed refresh session', async () => {
    const user = testAccount(await hash('right-password', 4));
    const findAccountByEmail = jest.fn().mockResolvedValue(user);
    const createRefreshToken: jest.MockedFunction<WebAuthRepository['createRefreshToken']> = jest
      .fn()
      .mockResolvedValue(true);
    const repo = webAuthRepository({ findAccountByEmail, createRefreshToken });
    const jwt = testJwt();

    const result = await sessionService(repo, jwt).login(
      { email: ' User@Example.Test ', password: 'right-password' },
      { ipAddress: '127.0.0.1', userAgent: 'unit-test' },
    );

    expect(findAccountByEmail).toHaveBeenCalledWith('user@example.test');
    expect(result.user).toMatchObject({ id: user.id, email: user.email });
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const persisted = jest.mocked(createRefreshToken).mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      accountId: user.id,
      ipAddress: '127.0.0.1',
      userAgent: 'unit-test',
    });
    expect(persisted?.tokenHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    await expect(
      jwt.verifyAsync(result.accessToken, {
        algorithms: ['HS256'],
        issuer: 'kitty-api',
        audience: 'kitty-web',
      }),
    ).resolves.toMatchObject({ sub: user.id, surface: 'web' });
  });

  it('returns the same credential error for unknown email and wrong password', async () => {
    const passwordHash = await hash('right-password', 4);
    for (const account of [null, testAccount(passwordHash)]) {
      await expect(
        sessionService(
          webAuthRepository({ findAccountByEmail: jest.fn().mockResolvedValue(account) }),
        ).login({ email: 'user@example.test', password: 'wrong-password' }, {}),
      ).rejects.toBeInstanceOf(WebAuthApplicationError);
    }
  });

  it('requires password proof before reporting an unverified account', async () => {
    const pending = testAccount(await hash('right-password', 4), { emailVerifiedAt: null });
    const findAccountByEmail = jest.fn().mockResolvedValue(pending);
    await expect(
      sessionService(webAuthRepository({ findAccountByEmail })).login(
        { email: ' User@Example.Test ', password: 'right-password' },
        {},
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(findAccountByEmail).toHaveBeenCalledWith('user@example.test');
  });

  it('rejects disabled accounts after validating the submitted password', async () => {
    const disabled = testAccount(await hash('right-password', 4), { disabledAt: now });
    await expect(
      sessionService(
        webAuthRepository({ findAccountByEmail: jest.fn().mockResolvedValue(disabled) }),
      ).login({ email: 'user@example.test', password: 'right-password' }, {}),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('rotates a valid refresh token and rejects malformed or revoked tokens', async () => {
    const user = testAccount('password-hash');
    const rotateRefreshToken: jest.MockedFunction<WebAuthRepository['rotateRefreshToken']> = jest
      .fn()
      .mockResolvedValue({ outcome: 'ROTATED', account: user });
    const repo = webAuthRepository({ rotateRefreshToken });
    const session = sessionService(repo);
    const rawToken = 'a'.repeat(64);

    await expect(session.refresh(rawToken, {})).resolves.toMatchObject({ user: { id: user.id } });
    const rotatedWith = jest.mocked(rotateRefreshToken).mock.calls[0];
    expect(rotatedWith?.[0]).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(rotatedWith?.[1].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rotatedWith?.[1].tokenHash).not.toBe(rawToken);
    expect(rotatedWith?.[2]).toBe(now);
    await expect(session.refresh('bad-token', {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    rotateRefreshToken.mockResolvedValueOnce({ outcome: 'REUSED' });
    await expect(session.refresh(rawToken, {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(rotateRefreshToken).toHaveBeenCalledTimes(2);
  });

  it('revokes only syntactically valid refresh tokens on logout', async () => {
    const revokeRefreshToken = jest.fn().mockResolvedValue(undefined);
    const session = sessionService(webAuthRepository({ revokeRefreshToken }));
    const rawToken = 'b'.repeat(64);

    await session.logout(rawToken);
    await session.logout('malformed');

    expect(revokeRefreshToken).toHaveBeenCalledTimes(1);
    expect(revokeRefreshToken).toHaveBeenCalledWith(
      createHash('sha256').update(rawToken).digest('hex'),
      now,
    );
  });

  it('resolves current account state and keeps existing legacy sessions usable', async () => {
    const legacy = testAccount('legacy-password', { email: null, emailVerifiedAt: null });
    await expect(
      sessionService(
        webAuthRepository({ findAccountById: jest.fn().mockResolvedValue(legacy) }),
      ).accountForAccessToken(legacy.id),
    ).resolves.toMatchObject({ id: legacy.id, email: null, emailVerifiedAt: null });
    await expect(
      sessionService(
        webAuthRepository({ findAccountById: jest.fn().mockResolvedValue(null) }),
      ).accountForAccessToken(legacy.id),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('continues an existing refresh session for a retained legacy account', async () => {
    const legacy = testAccount('legacy-password', { email: null, emailVerifiedAt: null });
    const rotateRefreshToken: jest.MockedFunction<WebAuthRepository['rotateRefreshToken']> = jest
      .fn()
      .mockResolvedValue({ outcome: 'ROTATED', account: legacy });

    await expect(
      sessionService(webAuthRepository({ rotateRefreshToken })).refresh('a'.repeat(64), {}),
    ).resolves.toMatchObject({ user: { id: legacy.id, email: null, emailVerifiedAt: null } });
    expect(rotateRefreshToken).toHaveBeenCalledTimes(1);
  });
});
