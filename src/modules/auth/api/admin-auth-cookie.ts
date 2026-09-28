import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request } from 'express';
import type { AppConfiguration } from '@config/configuration';

@Injectable()
export class AdminAuthCookies {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  get refreshName(): string {
    return this.production ? '__Secure-kitty_admin_refresh' : 'kitty_admin_refresh';
  }

  get refreshOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.production,
      sameSite: 'lax',
      path: `/${this.config.get('apiPrefix', { infer: true }).replace(/^\/+|\/+$/g, '')}/admin/auth`,
    };
  }

  readRefresh(request: Request): string | undefined {
    return request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${this.refreshName}=`))
      ?.slice(this.refreshName.length + 1);
  }

  private get production(): boolean {
    return this.config.get('nodeEnv', { infer: true }) === 'production';
  }
}

/** CORS controls response visibility; this origin check protects cookie mutations from CSRF. */
@Injectable()
export class AdminAuthOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const allowed = this.config.get('corsOrigins', { infer: true });
    if (
      !origin ||
      !allowed.includes(origin) ||
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
