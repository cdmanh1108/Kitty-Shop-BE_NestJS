import { parseObjectStorageConfiguration } from '../src/config/object-storage.configuration';
import { config } from 'dotenv';
config();

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { S3ObjectStorageAdapter } from '../src/common/storage/s3-object-storage.adapter';
import {
  buildProductMediaKey,
  validateAndHashImage,
} from '../src/common/storage/storage-key.builder';

interface CliArgs {
  apply: boolean;
  dryRun: boolean;
  force: boolean;
  productCode?: string;
  limit?: number;
  concurrency: number;
  cacheDir: string;
}

function parseCliArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    apply: false,
    dryRun: true,
    force: false,
    concurrency: 2,
    cacheDir: join(process.cwd(), 'private-data', 'cache', 'product-media'),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      result.apply = true;
      result.dryRun = false;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
      result.apply = false;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--product-code' && args[i + 1]) {
      result.productCode = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[++i]!, 10);
    } else if (arg === '--concurrency' && args[i + 1]) {
      const c = parseInt(args[++i]!, 10);
      result.concurrency = Math.max(1, Math.min(4, c));
    } else if (arg === '--cache-dir' && args[i + 1]) {
      result.cacheDir = args[++i]!;
    }
  }

  return result;
}

interface FailureReport {
  productCode: string;
  mediaId: string;
  sourceUrl: string;
  errorCode: string;
  httpStatus?: number;
  retries: number;
  message: string;
}

interface SyncStats {
  total: number;
  alreadyMigrated: number;
  cacheHits: number;
  downloaded: number;
  uploaded: number;
  objectsReused: number;
  dbUpdated: number;
  skipped: number;
  failed: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Downloads resource from external URL with retry, exponential backoff, jitter, and timeout.
 */
async function downloadWithRetry(
  url: string,
  cachePath: string,
  maxRetries = 3,
): Promise<{ buffer: Buffer; contentType?: string; cacheHit: boolean; retries: number }> {
  // 1. Check local cache
  if (existsSync(cachePath)) {
    const buffer = readFileSync(cachePath);
    if (buffer.length > 0) {
      return { buffer, cacheHit: true, retries: 0 };
    }
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KittyRentalShop/1.0',
        },
      });

      clearTimeout(timeoutId);

      const status = response.status;
      const contentType = response.headers.get('content-type') || undefined;

      // Unrecoverable errors
      if (status === 404) {
        throw Object.assign(new Error(`Source returned 404 Not Found`), {
          errorCode: 'SOURCE_NOT_FOUND',
          httpStatus: 404,
          retryable: false,
        });
      }

      // Quota / Rate-limit or Server error
      if (status === 429 || status === 408 || (status >= 500 && status <= 504)) {
        const error = Object.assign(new Error(`Source returned HTTP ${status}`), {
          errorCode: status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR',
          httpStatus: status,
          retryable: true,
        });
        if (attempt >= maxRetries) throw error;

        // Exponential backoff + jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.floor(Math.random() * 1000);
        await sleep(baseDelay + jitter);
        continue;
      }

      if (!response.ok) {
        throw Object.assign(new Error(`Source download failed with HTTP ${status}`), {
          errorCode: 'DOWNLOAD_FAILED',
          httpStatus: status,
          retryable: false,
        });
      }

      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Cache locally to prevent redundant future downloads
      try {
        writeFileSync(cachePath, buffer);
      } catch {
        // Cache write errors should not block migration
      }

      return { buffer, contentType, cacheHit: false, retries: attempt - 1 };
    } catch (err: unknown) {
      const error = err as { retryable?: boolean; message?: string; name?: string };
      if (error.retryable === false) {
        throw err;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
      await sleep(delay);
    }
  }

  throw new Error(`Failed to download after ${maxRetries} attempts`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  console.log('====================================================');
  console.log('  Product Media S3 Object Storage Sync Tool');
  console.log('====================================================');
  console.log(
    `Mode:         ${args.apply ? 'APPLY (Mutations Enabled)' : 'DRY-RUN (Simulate Only)'}`,
  );
  console.log(`Force:        ${args.force}`);
  console.log(`Concurrency:  ${args.concurrency}`);
  console.log(`Cache Dir:    ${args.cacheDir}`);
  if (args.productCode) console.log(`Filter Code:  ${args.productCode}`);
  if (args.limit) console.log(`Limit:        ${args.limit}`);
  console.log('----------------------------------------------------');

  // Ensure cache dir exists
  if (!existsSync(args.cacheDir)) {
    mkdirSync(args.cacheDir, { recursive: true });
  }

  const prisma = new PrismaClient();

  const storageConfig = parseObjectStorageConfiguration(process.env);
  const { bucket, endpoint, region, accessKeyId, secretAccessKey, publicBaseUrl } = storageConfig;

  let storageAdapter: S3ObjectStorageAdapter | null = null;
  if (args.apply) {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      console.error(
        '\n[FATAL] --apply requires OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_ACCESS_KEY_ID, and OBJECT_STORAGE_SECRET_ACCESS_KEY to be set.',
      );
      process.exit(1);
    }
    storageAdapter = new S3ObjectStorageAdapter({
      bucket,
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl,
    });
  } else if (bucket && accessKeyId && secretAccessKey) {
    // In dry-run, if credentials exist, we can optionally use adapter for HEAD checks
    storageAdapter = new S3ObjectStorageAdapter({
      bucket,
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl,
    });
  }

  const whereClause: Record<string, unknown> = {};
  if (args.productCode) {
    whereClause.product = { code: args.productCode };
  }

  const mediaRecords = await prisma.productMedia.findMany({
    where: whereClause,
    include: {
      product: { select: { code: true, name: true } },
      shop: { select: { code: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: args.limit,
  });

  console.log(`Found ${mediaRecords.length} ProductMedia records to inspect.\n`);

  const stats: SyncStats = {
    total: mediaRecords.length,
    alreadyMigrated: 0,
    cacheHits: 0,
    downloaded: 0,
    uploaded: 0,
    objectsReused: 0,
    dbUpdated: 0,
    skipped: 0,
    failed: 0,
  };

  const failures: FailureReport[] = [];

  // Concurrency chunk runner
  for (let i = 0; i < mediaRecords.length; i += args.concurrency) {
    const chunk = mediaRecords.slice(i, i + args.concurrency);

    await Promise.all(
      chunk.map(async (media) => {
        const productCode = media.product.code;
        const shopCode = media.shop.code;

        // Check if already migrated
        if (media.storageKey && !args.force) {
          stats.alreadyMigrated++;
          return;
        }

        const legacyFileId =
          (media.metadata as { legacyFileId?: string } | null)?.legacyFileId || media.id;
        const cacheFilePath = join(args.cacheDir, `${legacyFileId}.bin`);

        try {
          // 1. Download / fetch cached bytes
          const { buffer, contentType, cacheHit } = await downloadWithRetry(
            media.url,
            cacheFilePath,
          );

          if (cacheHit) {
            stats.cacheHits++;
          } else {
            stats.downloaded++;
          }

          // 2. Validate image format and calculate SHA-256
          const validated = validateAndHashImage(buffer, contentType);

          // 3. Build deterministic canonical storage key
          const storageKey = buildProductMediaKey({
            shopCode,
            productCode,
            contentHash: validated.contentHash,
            extension: validated.extension,
          });

          // 4. Storage operations
          let objectExists = false;
          if (storageAdapter) {
            const headRes = await storageAdapter.headObject(storageKey);
            objectExists = headRes !== null;

            if (objectExists) {
              stats.objectsReused++;
            } else if (args.apply) {
              await storageAdapter.putObject({
                key: storageKey,
                body: buffer,
                contentType: validated.mimeType,
                cacheControl: 'public, max-age=31536000, immutable',
              });
              stats.uploaded++;
            }
          }

          // 5. Update Database
          if (args.apply) {
            const existingMetadata =
              typeof media.metadata === 'object' && media.metadata !== null
                ? (media.metadata as Record<string, unknown>)
                : {};

            await prisma.productMedia.update({
              where: { id: media.id },
              data: {
                storageKey,
                metadata: {
                  ...existingMetadata,
                  contentHash: validated.contentHash,
                  sizeBytes: validated.sizeBytes,
                  mimeType: validated.mimeType,
                  migratedAt: new Date().toISOString(),
                },
              },
            });
            stats.dbUpdated++;
            console.log(
              `[APPLY] Migrated ${productCode} (${media.id.slice(0, 8)}) -> ${storageKey}`,
            );
          } else {
            console.log(
              `[DRY-RUN] Would migrate ${productCode} (${media.id.slice(0, 8)}) -> ${storageKey} (${(validated.sizeBytes / 1024).toFixed(1)} KB)`,
            );
          }
        } catch (err: unknown) {
          stats.failed++;
          const error = err as {
            errorCode?: string;
            httpStatus?: number;
            message?: string;
          };
          const report: FailureReport = {
            productCode,
            mediaId: media.id,
            sourceUrl: media.url,
            errorCode: error.errorCode || 'UNKNOWN_ERROR',
            httpStatus: error.httpStatus,
            retries: 0,
            message: error.message || String(err),
          };
          failures.push(report);
          console.error(`[FAIL] ${productCode} (${media.id.slice(0, 8)}): ${report.message}`);
        }
      }),
    );
  }

  await prisma.$disconnect();

  console.log('\n====================================================');
  console.log('  Migration Summary Report');
  console.log('====================================================');
  console.log(`Total Media Inspected:   ${stats.total}`);
  console.log(`Already Migrated:        ${stats.alreadyMigrated}`);
  console.log(`Cache Hits:              ${stats.cacheHits}`);
  console.log(`Downloaded from Source:  ${stats.downloaded}`);
  console.log(`Uploaded to Storage:     ${stats.uploaded}`);
  console.log(`Storage Objects Reused:  ${stats.objectsReused}`);
  console.log(`DB Records Updated:      ${stats.dbUpdated}`);
  console.log(`Skipped:                 ${stats.skipped}`);
  console.log(`Failed:                  ${stats.failed}`);
  console.log('----------------------------------------------------');

  if (failures.length > 0) {
    console.log('\nFailures Detail:');
    for (const f of failures) {
      console.log(
        `- Product: ${f.productCode}, Media: ${f.mediaId}, Code: ${f.errorCode} (HTTP ${f.httpStatus ?? 'N/A'}), Error: ${f.message}`,
      );
    }
  }

  if (args.apply && stats.failed > 0) {
    console.error(`\n[ERROR] Migration completed with ${stats.failed} unresolved failures.`);
    process.exit(1);
  } else {
    console.log('\n[SUCCESS] Migration run completed successfully.');
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
