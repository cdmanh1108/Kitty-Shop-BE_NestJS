import { config } from 'dotenv';
config();

import { S3ObjectStorageAdapter } from '../src/common/storage/s3-object-storage.adapter';

async function main() {
  console.log('=== Object Storage Health Check ===');

  const provider = process.env.OBJECT_STORAGE_PROVIDER || 's3';
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT || '';
  const region = process.env.OBJECT_STORAGE_REGION || 'auto';
  const bucket = process.env.OBJECT_STORAGE_BUCKET || '';
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '';
  const publicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || '';

  console.log(`Provider:        ${provider}`);
  console.log(`Endpoint:        ${endpoint || '(default AWS S3)'}`);
  console.log(`Region:          ${region}`);
  console.log(`Bucket:          ${bucket || '(not configured)'}`);
  console.log(`Public Base URL: ${publicBaseUrl || '(not configured)'}`);
  console.log(`Access Key ID:   ${accessKeyId ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)}` : '(not configured)'}`);

  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.warn('\n[WARN] Object storage credentials are not fully configured in environment.');
    console.warn('To test against live Cloudflare R2 / S3, ensure OBJECT_STORAGE_* are set in .env.');
    process.exit(1);
  }

  try {
    const adapter = new S3ObjectStorageAdapter({
      bucket,
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl,
    });

    const testKey = `_healthcheck/ping-${Date.now()}.txt`;
    console.log(`\n1. Testing PUT on key: ${testKey}`);
    const putRes = await adapter.putObject({
      key: testKey,
      body: Buffer.from('ping'),
      contentType: 'text/plain',
    });
    console.log(`   PUT success. Public URL: ${putRes.publicUrl}`);

    console.log('2. Testing HEAD on test key...');
    const meta = await adapter.headObject(testKey);
    if (!meta) {
      throw new Error('HEAD check failed: object was written but not found.');
    }
    console.log(`   HEAD success. ContentLength: ${meta.contentLength}, ETag: ${meta.etag}`);

    console.log('3. Testing DELETE on test key (cleanup)...');
    await adapter.deleteObject(testKey);
    const metaAfter = await adapter.headObject(testKey);
    if (metaAfter !== null) {
      throw new Error('DELETE check failed: object still exists after deletion.');
    }
    console.log('   DELETE success. Cleaned up test object.');

    console.log('\n[PASS] Object storage credentials, bucket connectivity, and read/write/delete permissions verified successfully!');
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`\n[FAIL] Storage check failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
