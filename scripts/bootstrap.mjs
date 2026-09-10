import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const envPath = '.env';
const examplePath = '.env.example';

if (!existsSync(envPath)) {
  let env = readFileSync(examplePath, 'utf8');
  env = env.replace(
    'JWT_ACCESS_SECRET=replace-with-at-least-32-random-characters',
    `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`,
  );
  writeFileSync(envPath, env);
  console.log('Created .env from .env.example and generated a local JWT secret.');
}

let envText = readFileSync(envPath, 'utf8');
const placeholderSecret = 'replace-with-at-least-32-random-characters';
if (envText.includes(`JWT_ACCESS_SECRET=${placeholderSecret}`)) {
  envText = envText.replace(
    `JWT_ACCESS_SECRET=${placeholderSecret}`,
    `JWT_ACCESS_SECRET=${randomBytes(48).toString('hex')}`,
  );
  writeFileSync(envPath, envText);
  console.log('Generated a local JWT secret because .env still contained the example placeholder.');
}
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
    ...options,
  });
  return result.status === 0;
};

if ((env.DB_AUTO_START ?? 'false').toLowerCase() === 'true') {
  const dockerAvailable = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
  if (dockerAvailable) {
    console.log('Starting local PostgreSQL with Docker Compose...');
    if (!run('docker', ['compose', 'up', '-d', 'postgres'])) {
      console.warn('Docker Compose could not start PostgreSQL. Continuing with DATABASE_URL from .env.');
    }
  } else {
    console.warn('Docker is not available. Continuing with DATABASE_URL from .env.');
  }
}

console.log('Generating Prisma Client...');
if (!run('npm', ['exec', '--', 'prisma', 'generate'])) process.exit(1);

console.log('Applying database migrations...');
let migrated = false;
for (let attempt = 1; attempt <= 15; attempt += 1) {
  if (run('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'])) {
    migrated = true;
    break;
  }
  if (attempt < 15) {
    console.log(`Database is not ready yet (${attempt}/15). Retrying...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
if (!migrated) {
  console.error('Could not apply migrations. Check DATABASE_URL / PostgreSQL and rerun npm run bootstrap.');
  process.exit(1);
}

console.log('Seeding default shop, RBAC and lookups...');
if (!run('npm', ['run', 'db:seed'])) process.exit(1);

console.log('Exporting OpenAPI document...');
if (!run('npm', ['run', 'openapi:export'])) process.exit(1);

console.log('\nBootstrap complete.');
console.log('Run: npm run start:dev');
console.log(`Swagger: http://localhost:${env.PORT ?? '3000'}/docs`);
console.log('OpenAPI JSON: generated/openapi.json');
console.log(`Default admin: ${env.DEFAULT_ADMIN_EMAIL ?? 'admin@example.com'}`);
