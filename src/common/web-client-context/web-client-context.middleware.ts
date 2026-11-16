import { ForbiddenException, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  currentRequestMetadata,
  withRequestContext,
} from '@common/request-context/request-context';
import type { AppConfiguration } from '@config/configuration';
import {
  bindVerifiedWebClient,
  verifyWebClientContext,
  WEB_CLIENT_CONTEXT_HEADER,
} from './verified-web-client';

export function invalidWebClientContext(): ForbiddenException {
  return new ForbiddenException({
    code: 'WEB_CLIENT_CONTEXT_INVALID',
    message: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.',
  });
}

@Injectable()
export class WebClientContextMiddleware implements NestMiddleware {
  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const proof = request.headers[WEB_CLIENT_CONTEXT_HEADER];
    if (proof === undefined) return next();
    const count = request.rawHeaders.filter(
      (_value, index) =>
        index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === WEB_CLIENT_CONTEXT_HEADER,
    ).length;
    const secret = this.config.get('webClientContext', { infer: true })?.secret;
    const ip =
      count === 1 && typeof proof === 'string' && secret
        ? verifyWebClientContext(
            proof,
            secret,
            request.method,
            request.originalUrl,
            this.clock.now().getTime(),
          )
        : undefined;
    if (!ip) throw invalidWebClientContext();
    bindVerifiedWebClient(request, ip);
    const metadata = currentRequestMetadata();
    if (metadata) return withRequestContext({ ...metadata, ipAddress: ip }, next);
    next();
  }
}
