import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../src/config/configuration';

async function main(): Promise<void> {
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

    const adminDocument = createAdminOpenApiDocument(app, swaggerOptions);
    const webDocument = createWebOpenApiDocument(app, swaggerOptions);

    const outputDir = resolve(__dirname, '../generated');
    await mkdir(outputDir, { recursive: true });

    await writeFile(
      resolve(outputDir, 'openapi-admin.json'),
      JSON.stringify(adminDocument, null, 2) + '\n',
    );
    await writeFile(
      resolve(outputDir, 'openapi-web.json'),
      JSON.stringify(webDocument, null, 2) + '\n',
    );
    // Maintain openapi.json as Admin OpenAPI for backwards compatibility with kitty-admin-fe
    await writeFile(
      resolve(outputDir, 'openapi.json'),
      JSON.stringify(adminDocument, null, 2) + '\n',
    );

    process.stdout.write('OpenAPI exported:\n');
    process.stdout.write(' - generated/openapi-admin.json (Admin API)\n');
    process.stdout.write(' - generated/openapi-web.json (Web Sale API)\n');
    process.stdout.write(' - generated/openapi.json (Admin API compatibility)\n');
  } finally {
    await app.close();
  }
}

void main();
