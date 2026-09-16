import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ErrorResDto } from '../dto/response.dto';
import { API_SURFACE_METADATA_KEY, type ApiSurfaceType } from '../decorators/api-surface.decorator';

export interface OpenApiOptions {
  appName: string;
  apiPrefix: string;
  appUrl?: string;
}

export type ApiSurfaceFilter = ApiSurfaceType;

interface SurfaceSpecConfig {
  surface: ApiSurfaceFilter;
  meta: { title: string; description: string };
  includeAuth: boolean;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const;

function operationMatchesSurface(operation: unknown, targetSurface: ApiSurfaceFilter): boolean {
  if (!operation || typeof operation !== 'object') return false;
  const surface = (operation as Record<string, unknown>)[API_SURFACE_METADATA_KEY];
  if (Array.isArray(surface)) {
    return surface.includes(targetSurface);
  }
  return surface === targetSurface;
}

export function filterOpenApiDocument(
  baseDoc: OpenAPIObject,
  config: SurfaceSpecConfig,
): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};
  const usedTags = new Set<string>();
  const usedSchemas = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries(baseDoc.paths || {})) {
    if (!pathItem) continue;

    // Filter operations strictly by @ApiSurface metadata (x-api-surface)
    const matchingOperations: Record<string, unknown> = {};
    for (const m of HTTP_METHODS) {
      const op = pathItem[m];
      if (op && operationMatchesSurface(op, config.surface)) {
        matchingOperations[m] = op;
        if (op.tags) {
          for (const t of op.tags) {
            usedTags.add(t);
          }
        }
      }
    }

    if (Object.keys(matchingOperations).length > 0) {
      // Preserve path-level items (parameters, summary, etc.) along with matching operations
      const filteredPathItem: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(pathItem)) {
        if (HTTP_METHODS.includes(key as (typeof HTTP_METHODS)[number])) {
          if (matchingOperations[key]) {
            filteredPathItem[key] = matchingOperations[key];
          }
        } else {
          filteredPathItem[key] = val;
        }
      }
      filteredPaths[pathKey] = filteredPathItem as OpenAPIObject['paths'][string];
    }
  }

  const filteredTags = Array.from(usedTags).map((name) => {
    const existing = (baseDoc.tags || []).find((t) => t.name === name);
    return existing || { name };
  });

  // Extract schemas referenced by filtered paths
  const jsonStr = JSON.stringify(filteredPaths);
  const refMatches = jsonStr.matchAll(/"#\/components\/schemas\/([^"]+)"/g);
  for (const match of refMatches) {
    if (match[1]) usedSchemas.add(match[1]);
  }

  // Transitive schema dependencies resolution
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

  if (!config.includeAuth && components.securitySchemes) {
    delete components.securitySchemes;
  }
  if (config.includeAuth && components.securitySchemes) {
    const referenced = new Set<string>();
    for (const item of Object.values(filteredPaths)) {
      if (!item) continue;
      for (const method of HTTP_METHODS) {
        for (const requirement of item[method]?.security ?? []) {
          for (const name of Object.keys(requirement)) referenced.add(name);
        }
      }
    }
    components.securitySchemes = Object.fromEntries(
      Object.entries(components.securitySchemes).filter(([name]) => referenced.has(name)),
    );
  }

  return {
    ...baseDoc,
    info: {
      ...baseDoc.info,
      title: config.meta.title,
      description: config.meta.description,
    },
    paths: filteredPaths,
    tags: filteredTags.length > 0 ? filteredTags : undefined,
    components,
    security: config.includeAuth ? baseDoc.security : undefined,
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
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth('kitty_web_access', { type: 'apiKey', in: 'cookie' }, 'web-access')
    .addCookieAuth('kitty_web_refresh', { type: 'apiKey', in: 'cookie' }, 'web-refresh');

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

export function createAdminOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(baseDoc, {
    surface: 'admin',
    meta: {
      title: `${options.appName} - Admin API`,
      description:
        'Rental shop admin API for staff & operations (kitty-admin-fe). Tenant scope comes from the authenticated shop membership. Monetary values are decimal-safe values.',
    },
    includeAuth: true,
  });
}

export function createWebOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(baseDoc, {
    surface: 'web',
    meta: {
      title: `${options.appName} - Web Sale API`,
      description:
        'Public Web Storefront & Sale API for customer storefront (kitty-web-nextjs). Authoritative server-side pricing and inventory availability.',
    },
    includeAuth: true,
  });
}

export function createSystemOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(baseDoc, {
    surface: 'system',
    meta: {
      title: `${options.appName} - System API`,
      description: 'System health, liveness, and infrastructure probes.',
    },
    includeAuth: false,
  });
}

export function createOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  return createAdminOpenApiDocument(app, options);
}
