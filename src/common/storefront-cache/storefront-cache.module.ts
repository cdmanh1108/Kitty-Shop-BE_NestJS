import { Module } from '@nestjs/common';
import { LoggingModule } from '@common/logging/logging.module';
import { HttpStorefrontCacheAdapter } from './http-storefront-cache.adapter';
import { STOREFRONT_CACHE_INVALIDATOR } from './storefront-cache.port';

@Module({
  imports: [LoggingModule],
  providers: [{ provide: STOREFRONT_CACHE_INVALIDATOR, useClass: HttpStorefrontCacheAdapter }],
  exports: [STOREFRONT_CACHE_INVALIDATOR],
})
export class StorefrontCacheModule {}
