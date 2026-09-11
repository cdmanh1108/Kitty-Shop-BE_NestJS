import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OBJECT_STORAGE_PORT, ObjectStoragePort } from './object-storage.port';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter';
import { resolvePublicUrl } from './public-url.resolver';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE_PORT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ObjectStoragePort => {
        const bucket = configService.get<string>('OBJECT_STORAGE_BUCKET') || process.env.OBJECT_STORAGE_BUCKET || '';
        const endpoint = configService.get<string>('OBJECT_STORAGE_ENDPOINT') || process.env.OBJECT_STORAGE_ENDPOINT || '';
        const region = configService.get<string>('OBJECT_STORAGE_REGION') || process.env.OBJECT_STORAGE_REGION || 'auto';
        const accessKeyId = configService.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID') || process.env.OBJECT_STORAGE_ACCESS_KEY_ID || '';
        const secretAccessKey = configService.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY') || process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '';
        const publicBaseUrl = configService.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL') || process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || '';

        if (!bucket) {
          // Return a fallback port that allows public URL resolution and fails cleanly on mutation
          return {
            putObject: () =>
              Promise.reject(
                new Error('Object storage is not configured: missing OBJECT_STORAGE_BUCKET'),
              ),
            headObject: () => Promise.resolve(null),
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
  exports: [OBJECT_STORAGE_PORT],
})
export class StorageModule {}
