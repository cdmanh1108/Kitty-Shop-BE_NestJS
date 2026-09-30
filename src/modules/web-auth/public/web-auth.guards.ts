import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfiguration } from '@config/configuration';
import type { Request } from 'express';
import { WebSessionService } from '../application/web-session.service';
import { authError } from '../application/web-auth.errors';
import type { WebAuthPrincipal } from './web-auth-principal';
import type { WebAuthRequest } from './web-auth-request';
import { WebAuthCookies } from '../api/web-auth-cookies';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WebAccessPayload {
  sub: string;
  surface: 'web';
}

function isWebAccessPayload(payload: unknown): payload is WebAccessPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sub' in payload &&
    typeof payload.sub === 'string' &&
    uuid.test(payload.sub) &&
    'surface' in payload &&
    payload.surface === 'web'
  );
}

async function resolveWebRequestUser(
  request: WebAuthRequest,
  jwt: JwtService,
  session: WebSessionService,
  cookies: WebAuthCookies,
): Promise<WebAuthPrincipal | null> {
  const token = cookies.readAccess(request);
  if (!token) return null;

  let payload: unknown;
  try {
    payload = await jwt.verifyAsync(token, {
      algorithms: ['HS256'],
      issuer: 'kitty-api',
      audience: 'kitty-web',
    });
  } catch {
    authError('AUTH_REQUIRED', 401);
  }

  if (!isWebAccessPayload(payload)) authError('AUTH_REQUIRED', 401);

  // Account reload is intentionally outside the token-failure boundary: a repository outage
  // must reach the global error filter as infrastructure failure, never become a false 401.
  return session.accountForAccessToken(payload.sub);
}

@Injectable()
export class WebJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly session: WebSessionService,
    private readonly cookies: WebAuthCookies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebAuthRequest>();
    const user = await resolveWebRequestUser(request, this.jwt, this.session, this.cookies);
    if (!user) authError('AUTH_REQUIRED', 401);
    request.webUser = user;
    return true;
  }
}

/**
 * Authenticates a WebAccount when an access cookie is present, while preserving
 * true guest requests. A malformed or expired supplied credential is rejected;
 * it is never silently treated as a guest session.
 */
@Injectable()
export class OptionalWebJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly session: WebSessionService,
    private readonly cookies: WebAuthCookies,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebAuthRequest>();
    const user = await resolveWebRequestUser(request, this.jwt, this.session, this.cookies);
    if (user) request.webUser = user;
    return true;
  }
}

@Injectable()
export class WebAuthOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'GET') return true;
    const origin = request.headers.origin;
    const allowed = [
      ...this.config.get('corsOrigins', { infer: true }),
      new URL(this.config.get('appUrl', { infer: true })).origin,
    ];
    const contentType = request.headers['content-type'];
    const isJson = typeof contentType === 'string' && contentType.includes('application/json');
    const contentLength = request.headers['content-length'];
    const hasBody =
      (typeof contentLength === 'string' && Number.parseInt(contentLength, 10) > 0) ||
      request.headers['transfer-encoding'] !== undefined;
    if (
      (hasBody && !isJson) ||
      (origin && !allowed.includes(origin)) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      throw new ForbiddenException({
        code: 'AUTH_ORIGIN_REJECTED',
        message: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.',
      });
    }
    return true;
  }
}
