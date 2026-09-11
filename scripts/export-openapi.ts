import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../src/config/configuration';

async function main(): Promise<void> {
  // OpenAPI generation is metadata-only and must not require PostgreSQL to be reachable.
  process.env.SKIP_DATABASE_CONNECT = 'true';

  const [{ createApplication }, { createOpenApiDocument }] = await Promise.all([
    import('../src/main'),
    import('../src/common/swagger/openapi'),
  ]);

  const app = await createApplication();
  try {
    const config = app.get(ConfigService<AppConfiguration, true>);
    const document = createOpenApiDocument(app, {
      appName: config.get('appName', { infer: true }),
      apiPrefix: config.get('apiPrefix', { infer: true }),
      appUrl: config.get('appUrl', { infer: true }),
    });
    const outputDir = resolve(__dirname, '../generated');
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, 'openapi.json'), JSON.stringify(document, null, 2));
    process.stdout.write('OpenAPI exported to generated/openapi.json\n');
  } finally {
    await app.close();
  }
}

void main();
