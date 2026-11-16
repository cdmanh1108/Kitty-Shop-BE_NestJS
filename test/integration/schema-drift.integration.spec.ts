import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  testDatabaseUrl,
} from '../helpers/test-database';

describe('migrated PostgreSQL and Prisma metadata', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('has no supported schema drift or proposed drops for SQL-created indexes', async () => {
    // Explicitly guarded test source only. Never use or fall back to the runtime DATABASE_URL.
    const url = testDatabaseUrl();
    const expected = new URL(url);
    const identity = await prisma.$queryRaw<{ database: string; schema: string }[]>`
      SELECT current_database() AS database, current_schema() AS schema
    `;
    expect(identity).toEqual([
      { database: decodeURIComponent(expected.pathname.slice(1)), schema: 'public' },
    ]);
    const root = resolve(__dirname, '../..');
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/prisma/build/index.js'),
        'migrate',
        'diff',
        '--from-schema-datasource',
        resolve(root, 'prisma/schema.prisma'),
        '--to-schema-datamodel',
        resolve(root, 'prisma/schema.prisma'),
        '--script',
        '--exit-code',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
      },
    );
    expect(result.error?.message).toBeUndefined();
    expect(result.signal).toBeNull();
    expect({
      exitCode: result.status,
      sql: result.stdout,
      diagnostics: result.stderr,
    }).toMatchObject({ exitCode: 0 });
    expect(result.stdout.replace(/^--.*$/gm, '').trim()).toBe('');
  }, 40_000);

  it('retains the trigram and OTP account/attempt index definitions from the applied baseline', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('customers_full_name_trgm_idx', 'products_name_trgm_idx', 'web_otp_challenges_account_attempt_idx')
      ORDER BY indexname
    `;
    expect(indexes.map((index) => index.indexname)).toEqual([
      'customers_full_name_trgm_idx',
      'products_name_trgm_idx',
      'web_otp_challenges_account_attempt_idx',
    ]);
    expect(indexes[0]?.indexdef).toContain('USING gin (full_name gin_trgm_ops)');
    expect(indexes[1]?.indexdef).toContain('USING gin (name gin_trgm_ops)');
    expect(indexes[2]?.indexdef).toContain('USING btree (account_id, registration_attempt_id)');
  });
});
