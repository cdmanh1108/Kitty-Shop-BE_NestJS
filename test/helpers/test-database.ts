import { PrismaService } from '../../src/database/prisma/prisma.service';

export function assertTestDatabase(url: string): string {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test database requires NODE_ENV=test');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('A valid explicit TEST_DATABASE_URL is required');
  }
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !/^(?:test_[a-z0-9_]+|[a-z0-9_]+_test)$/.test(name)
  ) {
    throw new Error('TEST_DATABASE_URL must name a dedicated test_* or *_test database');
  }
  const allowed = new Set([
    'schema',
    'connection_limit',
    'pool_timeout',
    'connect_timeout',
    'sslmode',
  ]);
  if (
    [...parsed.searchParams.keys()].some((key) => !allowed.has(key)) ||
    (parsed.searchParams.get('schema') ?? 'public') !== 'public'
  ) {
    throw new Error(
      'Test database must use public schema and cannot override its connection target',
    );
  }
  return name;
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error('TEST_DATABASE_URL is required; there is no DATABASE_URL or local fallback');
  assertTestDatabase(url);
  return url;
}

let testPrisma: PrismaService | undefined;
let lease: PrismaService | undefined;
let ownedUrl: string | undefined;

export async function connectTestDatabase(): Promise<PrismaService> {
  if (testPrisma) return testPrisma;
  const url = testDatabaseUrl();
  const lockUrl = new URL(url);
  lockUrl.searchParams.set('connection_limit', '1');
  lease = new PrismaService({ datasources: { db: { url: lockUrl.toString() } } });
  const client = new PrismaService({ datasources: { db: { url } } });
  try {
    await lease.$connect();
    // Dedicated single-connection client holds a session lock across suite resets.
    const locks = await lease.$queryRaw<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_lock(761234, 7) AS acquired`;
    if (!locks[0]?.acquired)
      throw new Error('Another test process owns this database; use a separate test database');
    await client.$connect();
    testPrisma = client;
    ownedUrl = url;
    return client;
  } catch (error) {
    await client.$disconnect();
    await lease.$disconnect();
    lease = undefined;
    throw error;
  }
}

export async function resetTestDatabase(prisma?: PrismaService): Promise<void> {
  const url = testDatabaseUrl();
  const name = assertTestDatabase(url);
  const client = prisma ?? (await connectTestDatabase());
  if (client !== testPrisma || url !== ownedUrl)
    throw new Error('Reset refuses an unowned or changed database client');
  const actual = await client.$queryRaw<
    { database: string; schema: string }[]
  >`SELECT current_database() AS database, current_schema() AS schema`;
  if (actual[0]?.database !== name || actual[0]?.schema !== 'public')
    throw new Error('Connected database identity does not match the explicit test target');
  const tables = await client.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`;
  if (!tables.length) throw new Error('Test database has no tables; run npm run test:db:migrate');
  const tableList = tables
    .map(({ tablename }) => '"public"."' + tablename.replaceAll('"', '""') + '"')
    .join(', ');
  await client.$executeRawUnsafe('TRUNCATE TABLE ' + tableList + ' RESTART IDENTITY CASCADE');
}

export async function disconnectTestDatabase(): Promise<void> {
  try {
    await testPrisma?.$disconnect();
  } finally {
    await lease?.$disconnect();
    testPrisma = undefined;
    lease = undefined;
    ownedUrl = undefined;
  }
}
