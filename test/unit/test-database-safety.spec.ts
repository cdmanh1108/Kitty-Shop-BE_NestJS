import { assertTestDatabase, testDatabaseUrl, resetTestDatabase } from '../helpers/test-database';
import { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Destructive test database safety', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalUrl = process.env.TEST_DATABASE_URL;
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalUrl === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = originalUrl;
  });
  it.each(['kitty', 'production', 'contest', 'latest', 'test', 'kitty_test/other'])(
    'rejects misleading database name %s',
    (name) => {
      expect(() => assertTestDatabase('postgresql://localhost/' + name)).toThrow();
    },
  );
  it.each(['production', 'development', ''])('refuses non-test environment %s', (env) => {
    process.env.NODE_ENV = env;
    expect(() => assertTestDatabase('postgresql://localhost/kitty_test')).toThrow('NODE_ENV=test');
  });
  it('rejects target overrides and non-public schemas', () => {
    expect(() => assertTestDatabase('postgresql://localhost/kitty_test?host=other')).toThrow();
    expect(() =>
      assertTestDatabase('postgresql://localhost/kitty_test?schema=production'),
    ).toThrow();
    expect(() => assertTestDatabase('https://localhost/kitty_test')).toThrow();
  });
  it('has no fallback to DATABASE_URL or an implicit local database', () => {
    delete process.env.TEST_DATABASE_URL;
    expect(testDatabaseUrl).toThrow('TEST_DATABASE_URL is required');
  });
  it('refuses arbitrary clients before any database operation', async () => {
    process.env.TEST_DATABASE_URL = 'postgresql://localhost/kitty_test';
    const unowned = new PrismaService({
      datasources: { db: { url: process.env.TEST_DATABASE_URL } },
    });
    await expect(resetTestDatabase(unowned)).rejects.toThrow('unowned');
    await unowned.$disconnect();
  });
});
