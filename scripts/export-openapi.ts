import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../src/config/configuration';

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const targetArg = args.find((arg) => arg.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1]?.toLowerCase() : 'all';

  // OpenAPI generation is metadata-only and must not require PostgreSQL to be reachable.
  process.env.SKIP_DATABASE_CONNECT = 'true';

  const [
    { createApplication },
    { createAdminOpenApiDocument, createWebOpenApiDocument },
  ] = await Promise.all([
    import('../src/main'),
    import('../src/common/swagger/openapi'),
  ]);

  const app = await createApplication();
  try {
    const config = app.get(ConfigService<AppConfiguration, true>);
    const swaggerOptions = {
      appName: config.get('appName', { infer: true }),
      apiPrefix: config.get('apiPrefix', { infer: true }),
      appUrl: config.get('appUrl', { infer: true }),
    };

    const outputDir = resolve(__dirname, '../generated');
    await mkdir(outputDir, { recursive: true });

    const plannedWrites: Array<{ filename: string; content: string; label: string }> = [];

    if (target === 'all' || target === 'web') {
      const webDocument = createWebOpenApiDocument(app, swaggerOptions);
      plannedWrites.push({
        filename: 'openapi-web.json',
        content: JSON.stringify(webDocument, null, 2) + '\n',
        label: 'Web Sale API',
      });
    }

    if (target === 'all' || target === 'admin') {
      const adminDocument = createAdminOpenApiDocument(app, swaggerOptions);
      plannedWrites.push({
        filename: 'openapi-admin.json',
        content: JSON.stringify(adminDocument, null, 2) + '\n',
        label: 'Admin API',
      });
      // Maintain openapi.json as Admin OpenAPI for backwards compatibility with kitty-admin-fe
      plannedWrites.push({
        filename: 'openapi.json',
        content: JSON.stringify(adminDocument, null, 2) + '\n',
        label: 'Admin API compatibility',
      });
    }

    if (isCheck) {
      const staleFiles: string[] = [];
      for (const item of plannedWrites) {
        const filePath = resolve(outputDir, item.filename);
        if (!existsSync(filePath)) {
          process.stderr.write(`[openapi:check] Missing artifact: generated/${item.filename}\n`);
          staleFiles.push(item.filename);
          continue;
        }
        const existing = await readFile(filePath, 'utf8');
        if (normalizeLineEndings(existing) !== normalizeLineEndings(item.content)) {
          process.stderr.write(`[openapi:check] Stale artifact: generated/${item.filename}\n`);
          staleFiles.push(item.filename);
        }
      }

      if (staleFiles.length > 0) {
        process.stderr.write(
          `\n[openapi:check] The following OpenAPI specifications are stale or missing:\n` +
            staleFiles.map((f) => ` - generated/${f}`).join('\n') +
            `\n\nRun "npm run openapi:export" to update them.\n`,
        );
        process.exit(1);
      }

      process.stdout.write('[openapi:check] All checked OpenAPI specifications are up to date.\n');
      return;
    }

    for (const item of plannedWrites) {
      await writeFile(resolve(outputDir, item.filename), item.content);
    }

    process.stdout.write('OpenAPI exported:\n');
    for (const item of plannedWrites) {
      process.stdout.write(` - generated/${item.filename} (${item.label})\n`);
    }
  } finally {
    await app.close();
  }
}

void main();

