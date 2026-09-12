import { spawnSync } from 'node:child_process';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  testDatabaseUrl,
} from '../test/helpers/test-database';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const url = testDatabaseUrl();
  await connectTestDatabase();
  try {
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: url },
      },
    );
    if (result.error || result.status !== 0)
      throw new Error('Không thể chạy migration cho cơ sở dữ liệu kiểm thử.');
  } finally {
    await disconnectTestDatabase();
  }
}
void main().catch(() => {
  console.error(
    'Test migration failed. Set TEST_DATABASE_URL to an accessible dedicated test_* or *_test database.',
  );
  process.exitCode = 1;
});
