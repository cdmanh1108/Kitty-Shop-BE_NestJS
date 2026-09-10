import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export interface OpenApiOptions {
  appName: string;
  apiPrefix: string;
  appUrl?: string;
}

export function createOpenApiDocument(app: INestApplication, options: OpenApiOptions): OpenAPIObject {
  const normalizedPrefix = options.apiPrefix.replace(/^\/+|\/+$/g, '');
  const serverPath = `/${normalizedPrefix}`;
  const builder = new DocumentBuilder()
    .setTitle(options.appName)
    .setDescription(
      'Rental shop admin API. Tenant scope comes from the authenticated shop membership. Monetary values are decimal-safe values; clients should not use floating-point math for accounting logic.',
    )
    .setVersion('1.0.0')
    .addServer(serverPath, 'API prefix')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    );

  if (options.appUrl) {
    const absolute = `${options.appUrl.replace(/\/$/, '')}${serverPath}`;
    builder.addServer(absolute, 'Configured application URL');
  }

  return SwaggerModule.createDocument(app, builder.build(), {
    ignoreGlobalPrefix: true,
    operationIdFactory: (controllerKey: string, methodKey: string) => `${controllerKey}_${methodKey}`,
  });
}
