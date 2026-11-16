import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { AppConfiguration } from '@config/configuration';
import {
  verifiedWebClientIp,
  WEB_CLIENT_CONTEXT_REQUIRED,
} from '@common/web-client-context/verified-web-client';
import { invalidWebClientContext } from '@common/web-client-context/web-client-context.middleware';

@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {
    super(options, storage, reflector);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresProof = this.reflector.getAllAndOverride<boolean>(WEB_CLIENT_CONTEXT_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      requiresProof &&
      this.config.get('webClientContext', { infer: true })?.required &&
      !verifiedWebClientIp(context.switchToHttp().getRequest<object>())
    ) {
      throw invalidWebClientContext();
    }
    return super.canActivate(context);
  }

  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    const ip = verifiedWebClientIp(request);
    return ip ? Promise.resolve(ip) : super.getTracker(request);
  }
}
