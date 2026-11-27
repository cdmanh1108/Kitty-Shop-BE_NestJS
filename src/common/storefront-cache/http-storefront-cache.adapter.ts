import type { AppConfiguration } from '@config/configuration';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPLICATION_LOGGER,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import type { StorefrontCacheInvalidator, StorefrontCacheScope } from './storefront-cache.port';

const REQUEST_TIMEOUT_MS = 1_500;

@Injectable()
export class HttpStorefrontCacheAdapter implements StorefrontCacheInvalidator {
  private readonly logger: ApplicationLog;

  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    @Inject(APPLICATION_LOGGER) loggerFactory: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory.create(HttpStorefrontCacheAdapter.name);
  }

  async invalidate(scope: StorefrontCacheScope): Promise<void> {
    const target = this.config.get('storefrontCache', { infer: true });
    if (!target) return;
    try {
      const response = await fetch(target.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scope }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
      if (response.status !== 204) {
        this.logger.error({
          event: 'storefront.cache.invalidation_failed',
          scope,
          status: response.status,
        });
        await response.body?.cancel();
      }
    } catch {
      this.logger.error({ event: 'storefront.cache.invalidation_failed', scope });
    }
  }
}
