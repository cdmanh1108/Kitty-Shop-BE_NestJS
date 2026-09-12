import type { AppConfiguration } from '@config/configuration';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OBJECT_STORAGE_PORT, ObjectStoragePort } from './object-storage.port';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';
import {
  resolvePublicUrl,
  PUBLIC_MEDIA_URL_RESOLVER,
  ConfiguredPublicMediaUrlResolver,
} from './public-url.resolver';

@Global()
@Module({
  providers: [
    {
      provide: PUBLIC_MEDIA_URL_RESOLVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) =>
        new ConfiguredPublicMediaUrlResolver(
          config.get('objectStorage', { infer: true }).publicBaseUrl,
        ),
    },
    {
      provide: OBJECT_STORAGE_PORT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>): ObjectStoragePort => {
        const { bucket, endpoint, region, accessKeyId, secretAccessKey, publicBaseUrl } =
          configService.get('objectStorage', { infer: true });

        if (!bucket) {
          // Return a fallback port that allows public URL resolution and fails cleanly on mutation
          return {
            putObject: () =>
              Promise.reject(
                new Error('Object storage is not configured: missing OBJECT_STORAGE_BUCKET'),
              ),
            headObject: () => Promise.reject(new Error('Object storage is not configured')),
            deleteObject: () =>
              Promise.reject(
                new Error('Object storage is not configured: missing OBJECT_STORAGE_BUCKET'),
              ),
            getPublicUrl: (key: string) => resolvePublicUrl(publicBaseUrl, key),
          };
        }

        return new S3ObjectStorageAdapter({
          bucket,
          endpoint,
          region,
          accessKeyId,
          secretAccessKey,
          publicBaseUrl,
        });
      },
    },
  ],
  exports: [OBJECT_STORAGE_PORT, PUBLIC_MEDIA_URL_RESOLVER],
})
export class StorageModule {}
