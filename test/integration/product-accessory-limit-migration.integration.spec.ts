import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { connectTestDatabase, disconnectTestDatabase } from '../helpers/test-database';

describe('Product accessory allowance additive migration', () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  afterAll(disconnectTestDatabase);

  it('keeps existing rows, fills one, defaults new rows to one and permits zero', async () => {
    const migration = await readFile(
      join(
        __dirname,
        '../../prisma/migrations/202611170001_product_free_accessory_limit/migration.sql',
      ),
      'utf8',
    );
    expect(migration.charCodeAt(0)).not.toBe(0xfeff);
    await prisma.$transaction(async (tx) => {
      // A temporary table shadows products only in this transaction/session.
      await tx.$executeRawUnsafe('CREATE TEMP TABLE products (id TEXT PRIMARY KEY) ON COMMIT DROP');
      await tx.$executeRawUnsafe("INSERT INTO pg_temp.products (id) VALUES ('existing')");
      for (const statement of migration
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean))
        await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe("INSERT INTO pg_temp.products (id) VALUES ('new')");
      expect(
        await tx.$queryRawUnsafe(
          'SELECT id, free_accessory_limit FROM pg_temp.products ORDER BY id',
        ),
      ).toEqual([
        { id: 'existing', free_accessory_limit: 1 },
        { id: 'new', free_accessory_limit: 1 },
      ]);
      await tx.$executeRawUnsafe(
        "UPDATE pg_temp.products SET free_accessory_limit = 0 WHERE id = 'existing'",
      );
    });
  });
});
