import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppConfiguration } from '@config/configuration';
import type { Request, CookieOptions } from 'express';
import { WebAuthService, authError } from '../application/web-auth.service';
import type { WebProfile } from '../domain/web-auth.repository';

export interface WebRequest extends Request {
  webUser?: WebProfile;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class WebAuthCookies {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}
  private get production(): boolean {
    return this.config.get('nodeEnv', { infer: true }) === 'production';
  }
  get accessName(): string {
    return this.production ? '__Secure-kitty_web_access' : 'kitty_web_access';
  }
  get refreshName(): string {
    return this.production ? '__Secure-kitty_web_refresh' : 'kitty_web_refresh';
  }
  get accessOptions(): CookieOptions {
    return { httpOnly: true, secure: this.production, sameSite: 'lax', path: '/api' };
  }
  get refreshOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.production,
      sameSite: 'lax',
      path: `/${this.config.get('apiPrefix', { infer: true }).replace(/^\/+|\/+$/g, '')}/web/auth`,
    };
  }
  readAccess(request: Request): string | undefined {
    return this.read(request, this.accessName);
  }
  readRefresh(request: Request): string | undefined {
    return this.read(request, this.refreshName);
  }
  private read(request: Request, name: string): string | undefined {
    return request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }
}

@Injectable()
export class WebJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: WebAuthService,
    private readonly cookies: WebAuthCookies,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebRequest>();
    const token = this.cookies.readAccess(request);
    if (!token) authError('AUTH_REQUIRED', 401);
    try {
      const payload: unknown = await this.jwt.verifyAsync(token, {
        algorithms: ['HS256'],
        issuer: 'kitty-api',
        audience: 'kitty-web',
      });
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        !uuid.test(payload.sub) ||
        !('surface' in payload) ||
        payload.surface !== 'web'
      )
        authError('AUTH_REQUIRED', 401);
      request.webUser = await this.auth.accountForAccessToken(payload.sub);
      return true;
    } catch {
      authError('AUTH_REQUIRED', 401);
    }
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
    if (
      !request.is('application/json') ||
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
