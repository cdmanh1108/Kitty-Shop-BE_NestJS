import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    const requestId = incoming && /^[a-zA-Z0-9_-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      // Express route templates contain parameter names, never parameter/query values.
      const route: unknown = (request.route as { path?: unknown } | undefined)?.path;
      const routeTemplate = typeof route === 'string' ? route : 'unmatched';
      const aborted = !response.writableFinished;
      const fields = {
        requestId,
        method: request.method,
        route: routeTemplate,
        statusCode: response.statusCode,
        aborted,
        durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
        userId: request.currentUser?.userId,
        shopId: request.currentUser?.shopId,
      };
      const level =
        aborted || response.statusCode >= 500
          ? 'error'
          : response.statusCode >= 400
            ? 'warn'
            : 'log';
      this.logger[level]({ event: 'http.request.completed', ...fields });
      const authAction =
        request.method === 'POST'
          ? /\/auth\/(login|refresh|logout|change-password)\/?$/.exec(routeTemplate)?.[1]
          : undefined;
      if (authAction)
        this.logger[level]({
          event: `auth.${authAction}`,
          ...fields,
          outcome: aborted ? 'aborted' : response.statusCode < 400 ? 'success' : 'failure',
        });
    };
    response.once('finish', record);
    response.once('close', record);
    next();
  }
}
