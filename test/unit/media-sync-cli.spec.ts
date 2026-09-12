import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main, parseCliArgs, downloadWithRetry } from '../../scripts/sync-product-media-storage';

const mockUpdate = jest.fn();
const mockFind = jest.fn();
const mockHead = jest.fn();
const mockPut = jest.fn();
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    productMedia: { findMany: mockFind, update: mockUpdate },
    $disconnect: jest.fn(),
  })),
}));
jest.mock('../../src/common/storage/s3-object-storage.adapter', () => ({
  S3ObjectStorageAdapter: jest.fn(() => ({ headObject: mockHead, putObject: mockPut })),
}));

describe('Real media sync CLI regression', () => {
  const jpeg = Buffer.from([255, 216, 255, 224]);
  const media = {
    id: 'synthetic',
    url: 'https://source.example.com/image',
    storageKey: null,
    metadata: null,
    product: { code: 'TEST' },
    shop: { code: 'TEST' },
  };
  let directory: string;
  let argv: string[];
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kitty-sync-regression-'));
    argv = process.argv;
    env = process.env;
    process.env = {
      ...env,
      OBJECT_STORAGE_PROVIDER: 's3',
      OBJECT_STORAGE_ENDPOINT: '',
      OBJECT_STORAGE_REGION: 'auto',
      OBJECT_STORAGE_BUCKET: 'test',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'synthetic-key',
      OBJECT_STORAGE_SECRET_ACCESS_KEY: 'synthetic-secret',
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://assets.example.com',
    };
    process.argv = ['node', 'sync', '--cache-dir', directory];
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('CLI failure');
    });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }));
    mockFind.mockReset();
    mockHead.mockReset();
    mockPut.mockReset();
    mockUpdate.mockReset();
    mockFind.mockResolvedValue([media]);
    mockHead.mockResolvedValue(null);
    mockPut.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });
  afterEach(() => {
    process.argv = argv;
    process.env = env;
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });
  it('defaults to dry-run and never uploads or persists; explicit dry-run overrides apply', async () => {
    expect(parseCliArgs(['--dry-run', '--apply']).apply).toBe(false);
    await main();
    expect(mockHead).toHaveBeenCalledTimes(1);
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('skips already migrated rows without network or persistence', async () => {
    mockFind.mockResolvedValue([{ ...media, storageKey: 'shops/test/image.jpg' }]);
    await main();
    expect(fetch).not.toHaveBeenCalled();
    expect(mockHead).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('uploads before persisting only the canonical key and metadata, then safely reuses an existing object', async () => {
    process.argv.push('--apply');
    mockUpdate.mockImplementation(() => {
      expect(mockPut).toHaveBeenCalledTimes(1);
      return Promise.resolve({});
    });
    await main();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: media.id },
      data: {
        storageKey: expect.stringMatching(/^shops\/test\/products\/test\/.*\.jpg$/) as unknown,
        metadata: expect.any(Object) as unknown,
      },
    });
    mockPut.mockClear();
    mockUpdate.mockReset().mockResolvedValue({});
    mockHead.mockResolvedValue({ contentLength: jpeg.length });
    await main();
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
  it('does not persist when upload fails or MIME validation rejects the source', async () => {
    process.argv.push('--apply');
    mockPut.mockRejectedValue(new Error('Storage unavailable'));
    await expect(main()).rejects.toThrow('CLI failure');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('rejects HTML before storage operations', async () => {
    process.argv.push('--apply');
    jest.mocked(fetch).mockResolvedValue(new Response('<html>quota</html>'));
    await expect(main()).rejects.toThrow('CLI failure');
    expect(mockHead).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('retries transient downloads with backoff and reuses cache', async () => {
    jest.useFakeTimers();
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(jpeg));
    const result = downloadWithRetry(media.url, join(directory, 'retry.bin'));
    await jest.runAllTimersAsync();
    expect((await result).retries).toBe(1);
    expect((await downloadWithRetry(media.url, join(directory, 'retry.bin'))).cacheHit).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('bounds CLI concurrency and rejects invalid numeric options', () => {
    expect(parseCliArgs(['--concurrency', '99']).concurrency).toBe(4);
    expect(() => parseCliArgs(['--concurrency', 'invalid'])).toThrow('--concurrency');
    expect(() => parseCliArgs(['--limit', '0'])).toThrow('--limit');
  });
  it('keeps the timeout active while reading a stalled response body', async () => {
    jest.useFakeTimers();
    jest.mocked(fetch).mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new Error('Download aborted')),
              );
            },
          }),
        ),
      ),
    );
    const result = expect(
      downloadWithRetry(media.url, join(directory, 'timeout.bin'), 1),
    ).rejects.toThrow('Download aborted');
    await jest.advanceTimersByTimeAsync(15000);
    await result;
  });
  it('limits actual concurrent downloads to the configured worker count', async () => {
    mockFind.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ ...media, id: `synthetic-${i}` })),
    );
    let active = 0;
    let maximum = 0;
    jest.mocked(fetch).mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return new Response(jpeg);
    });
    await main();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(maximum).toBe(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
