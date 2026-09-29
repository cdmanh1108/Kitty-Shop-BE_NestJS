import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { authError } from '../../src/modules/web-auth/application/web-auth.service';
import type { WebAuthService } from '../../src/modules/web-auth/application/web-auth.service';
import {
  OptionalWebJwtAuthGuard,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
  type WebRequest,
} from '../../src/modules/web-auth/api/web-jwt-auth';
import type { WebAuthCookies } from '../../src/modules/web-auth/api/web-jwt-auth';
import type { WebProfile } from '../../src/modules/web-auth/domain/web-auth.repository';
import type { AppConfiguration } from '../../src/config/configuration';

const accountId = '00000000-0000-4000-8000-000000000001';
const profile: WebProfile = {
  id: accountId,
  phone: '+84912345678',
  phoneVerifiedAt: new Date('2026-09-22T00:00:00Z'),
  createdAt: new Date('2026-09-20T00:00:00Z'),
};

function contextFor(request: WebRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function requestContextFor(request: {
  method: string;
  headers: Record<string, string | undefined>;
}) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function setup(
  options: {
    token?: string | undefined;
    payload?: unknown;
    accountForAccessToken?: jest.Mock;
  } = {},
) {
  const token = 'token' in options ? options.token : 'valid-access-token';
  const payload = options.payload ?? { sub: accountId, surface: 'web' };
  const accountForAccessToken =
    options.accountForAccessToken ?? jest.fn().mockResolvedValue(profile);
  const request = { headers: {} } as WebRequest;
  const verifyAsync = jest.fn().mockResolvedValue(payload);
  const jwt = { verifyAsync } as unknown as JwtService;
  const auth = { accountForAccessToken } as unknown as WebAuthService;
  const cookies = { readAccess: jest.fn().mockReturnValue(token) } as unknown as WebAuthCookies;
  return {
    request,
    verifyAsync,
    accountForAccessToken,
    cookies,
    guard: new WebJwtAuthGuard(jwt, auth, cookies),
  };
}

describe('WebJwtAuthGuard', () => {
  it('rejects a missing cookie without verifying a token or reloading an account', async () => {
    const { guard, request, verifyAsync, accountForAccessToken } = setup({ token: undefined });

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_REQUIRED' },
    });
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(accountForAccessToken).not.toHaveBeenCalled();
  });

  it('rejects invalid JWT verification without reloading an account', async () => {
    const { guard, request, verifyAsync, accountForAccessToken } = setup();
    verifyAsync.mockRejectedValueOnce(new Error('expired'));

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_REQUIRED' },
    });
    expect(accountForAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    [{ sub: 'not-a-uuid', surface: 'web' }],
    [{ sub: accountId, surface: 'admin' }],
    [{ sub: accountId }],
  ])(
    'rejects verified payloads with invalid web claims without reloading an account',
    async (payload) => {
      const { guard, request, accountForAccessToken } = setup({ payload });

      await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
        status: 401,
        response: { code: 'AUTH_REQUIRED' },
      });
      expect(accountForAccessToken).not.toHaveBeenCalled();
    },
  );

  it('preserves account-state authentication rejection', async () => {
    const accountForAccessToken = jest.fn(() => authError('AUTH_REQUIRED', 401));
    const { guard, request } = setup({ accountForAccessToken });

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_REQUIRED' },
    });
  });

  it('propagates infrastructure errors from account reload unchanged', async () => {
    const infrastructureError = new Error('database connection unavailable');
    const accountForAccessToken = jest.fn().mockRejectedValue(infrastructureError);
    const { guard, request } = setup({ accountForAccessToken });

    await expect(guard.canActivate(contextFor(request))).rejects.toBe(infrastructureError);
  });

  it('sets the request principal only after a successful account reload', async () => {
    const { guard, request, accountForAccessToken } = setup();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(accountForAccessToken).toHaveBeenCalledWith(accountId);
    expect(request.webUser).toEqual(profile);
  });
});

describe('OptionalWebJwtAuthGuard', () => {
  it('allows a true guest request without attempting JWT verification', async () => {
    const { request, verifyAsync, accountForAccessToken, cookies } = setup({ token: undefined });
    const guard = new OptionalWebJwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      { accountForAccessToken } as unknown as WebAuthService,
      cookies,
    );

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.webUser).toBeUndefined();
    expect(verifyAsync).not.toHaveBeenCalled();
    expect(accountForAccessToken).not.toHaveBeenCalled();
  });

  it('attaches a verified account to an optional request', async () => {
    const { request, verifyAsync, accountForAccessToken, cookies } = setup();
    const guard = new OptionalWebJwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      { accountForAccessToken } as unknown as WebAuthService,
      cookies,
    );

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.webUser).toEqual(profile);
  });

  it('rejects an invalid supplied credential instead of downgrading it to a guest request', async () => {
    const { request, verifyAsync, accountForAccessToken, cookies } = setup();
    verifyAsync.mockRejectedValueOnce(new Error('tampered'));
    const guard = new OptionalWebJwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      { accountForAccessToken } as unknown as WebAuthService,
      cookies,
    );

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_REQUIRED' },
    });
    expect(request.webUser).toBeUndefined();
    expect(accountForAccessToken).not.toHaveBeenCalled();
  });
});

describe('WebAuthOriginGuard', () => {
  function guard(): WebAuthOriginGuard {
    const config = {
      get: (key: keyof AppConfiguration) => {
        if (key === 'corsOrigins') return ['https://store.example'];
        if (key === 'appUrl') return 'https://store.example';
        throw new Error(`Unexpected configuration key: ${key}`);
      },
    };
    return new WebAuthOriginGuard(config as unknown as ConfigService<AppConfiguration, true>);
  }

  function expectOriginRejected(operation: () => void): void {
    try {
      operation();
      throw new Error('Expected the origin guard to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      if (!(error instanceof ForbiddenException)) return;
      expect(error.getResponse()).toMatchObject({ code: 'AUTH_ORIGIN_REJECTED' });
    }
  }

  it('allows a same-site, bodyless cancellation command without weakening body validation', () => {
    expect(
      guard().canActivate(
        requestContextFor({ method: 'POST', headers: { origin: 'https://store.example' } }),
      ),
    ).toBe(true);
  });

  it('rejects untrusted origins and non-JSON state-changing bodies', () => {
    expectOriginRejected(() =>
      guard().canActivate(
        requestContextFor({ method: 'POST', headers: { origin: 'https://evil.example' } }),
      ),
    );
    expectOriginRejected(() =>
      guard().canActivate(
        requestContextFor({
          method: 'POST',
          headers: { origin: 'https://store.example', 'content-length': '1' },
        }),
      ),
    );
  });
});
