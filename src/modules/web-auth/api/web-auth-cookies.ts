import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import type { CookieOptions, Request } from 'express';

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
