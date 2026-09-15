import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ErrorResDto } from '../dto/response.dto';

export interface OpenApiOptions {
  appName: string;
  apiPrefix: string;
  appUrl?: string;
}

function filterOpenApiDocument(
  baseDoc: OpenAPIObject,
  pathPredicate: (path: string) => boolean,
  meta: { title: string; description: string },
  includeAuth = true,
): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};
  const usedTags = new Set<string>();
  const usedSchemas = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries(baseDoc.paths || {})) {
    if (pathPredicate(pathKey)) {
      filteredPaths[pathKey] = pathItem;
      const methods = [
        'get',
        'post',
        'put',
        'delete',
        'patch',
        'options',
        'head',
        'trace',
      ] as const;
      for (const m of methods) {
        const op = pathItem?.[m];
        if (op?.tags) {
          for (const t of op.tags) usedTags.add(t);
        }
      }
    }
  }

  const filteredTags = Array.from(usedTags).map((name) => {
    const existing = (baseDoc.tags || []).find((t) => t.name === name);
    return existing || { name };
  });

  const jsonStr = JSON.stringify(filteredPaths);
  const refMatches = jsonStr.matchAll(/"#\/components\/schemas\/([^"]+)"/g);
  for (const match of refMatches) {
    if (match[1]) usedSchemas.add(match[1]);
  }

  let prevSize = 0;
  while (usedSchemas.size > prevSize) {
    prevSize = usedSchemas.size;
    for (const schemaName of Array.from(usedSchemas)) {
      const schemaObj = baseDoc.components?.schemas?.[schemaName];
      if (schemaObj) {
        const schemaStr = JSON.stringify(schemaObj);
        const subRefs = schemaStr.matchAll(/"#\/components\/schemas\/([^"]+)"/g);
        for (const m of subRefs) {
          if (m[1]) usedSchemas.add(m[1]);
        }
      }
    }
  }

  const filteredSchemas: NonNullable<NonNullable<OpenAPIObject['components']>['schemas']> = {};
  if (baseDoc.components?.schemas) {
    for (const schemaName of usedSchemas) {
      if (baseDoc.components.schemas[schemaName]) {
        filteredSchemas[schemaName] = baseDoc.components.schemas[schemaName];
      }
    }
    if (baseDoc.components.schemas.ErrorResDto) {
      filteredSchemas['ErrorResDto'] = baseDoc.components.schemas.ErrorResDto;
    }
  }

  const components: OpenAPIObject['components'] = {
    ...baseDoc.components,
    schemas: filteredSchemas,
  };

  if (!includeAuth && components.securitySchemes) {
    delete components.securitySchemes;
  }

  return {
    ...baseDoc,
    info: {
      ...baseDoc.info,
      title: meta.title,
      description: meta.description,
    },
    paths: filteredPaths,
    tags: filteredTags.length > 0 ? filteredTags : undefined,
    components,
    security: includeAuth ? baseDoc.security : undefined,
  };
}

export function createBaseOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const normalizedPrefix = options.apiPrefix.replace(/^\/+|\/+$/g, '');
  const serverPath = `/${normalizedPrefix}`;
  const builder = new DocumentBuilder()
    .setTitle(options.appName)
    .setDescription('Full API specification')
    .setVersion('1.0.0')
    .addServer(serverPath, 'API prefix')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token');

  if (options.appUrl) {
    const absolute = `${options.appUrl.replace(/\/$/, '')}${serverPath}`;
    builder.addServer(absolute, 'Configured application URL');
  }

  return SwaggerModule.createDocument(app, builder.build(), {
    ignoreGlobalPrefix: true,
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      const normalizedController = controllerKey
        .replace(/^AdminCatalogController$/, 'CatalogController')
        .replace(/^AdminRentalController$/, 'RentalController');
      return `${normalizedController}_${methodKey}`;
    },
    extraModels: [ErrorResDto],
  });
}

function isWebPath(path: string): boolean {
  return /(?:^|\/)web(?:\/|$)/.test(path);
}

export function createAdminOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(
    baseDoc,
    (path) => !isWebPath(path),
    {
      title: `${options.appName} - Admin API`,
      description:
        'Rental shop admin API for staff & operations (kitty-admin-fe). Tenant scope comes from the authenticated shop membership. Monetary values are decimal-safe values.',
    },
    true,
  );
}

export function createWebOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(
    baseDoc,
    (path) => isWebPath(path),
    {
      title: `${options.appName} - Web Sale API`,
      description:
        'Public Web Storefront & Sale API for customer storefront (kitty-web-nextjs). Authoritative server-side pricing and inventory availability.',
    },
    false,
  );
}

export function createOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  return createAdminOpenApiDocument(app, options);
}
