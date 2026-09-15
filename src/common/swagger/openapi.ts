import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ErrorResDto } from '../dto/response.dto';

export interface OpenApiOptions {
  appName: string;
  apiPrefix: string;
  appUrl?: string;
}

export const WEB_SURFACE_TAGS = new Set([
  'Web - Catalog',
  'Web - Rental Orders',
  'Web - Policies',
]);

export const ADMIN_SURFACE_TAGS = new Set([
  'Admin - Catalog',
  'Admin - Rental Orders',
  'Auth',
  'Customers',
  'Finance',
  'Dashboard',
  'Settings',
  'Reports',
  'Reminders',
  'Delivery',
  'Members & RBAC',
  'Health',
  'Audit',
]);

interface SurfaceSpecConfig {
  surface: 'admin' | 'web';
  allowedTags: Set<string>;
  pathMatcher: (path: string) => boolean;
  meta: { title: string; description: string };
  includeAuth: boolean;
}

function filterOpenApiDocument(
  baseDoc: OpenAPIObject,
  config: SurfaceSpecConfig,
): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};
  const usedTags = new Set<string>();
  const usedSchemas = new Set<string>();

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

  for (const [pathKey, pathItem] of Object.entries(baseDoc.paths || {})) {
    if (!config.pathMatcher(pathKey) || !pathItem) continue;

    // Check operations on this path
    let hasMatchingOperation = false;
    for (const m of methods) {
      const op = pathItem[m];
      if (op?.tags) {
        const matchesSurface = op.tags.some((t) => config.allowedTags.has(t));
        if (matchesSurface) {
          hasMatchingOperation = true;
          for (const t of op.tags) {
            if (config.allowedTags.has(t)) {
              usedTags.add(t);
            }
          }
        }
      }
    }

    if (hasMatchingOperation) {
      filteredPaths[pathKey] = pathItem;
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

  if (!config.includeAuth && components.securitySchemes) {
    delete components.securitySchemes;
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

function isAdminPath(path: string): boolean {
  // Matches all admin endpoints, compatibility paths, and private endpoints
  return !isWebPath(path);
}

export function createAdminOpenApiDocument(
  app: INestApplication,
  options: OpenApiOptions,
): OpenAPIObject {
  const baseDoc = createBaseOpenApiDocument(app, options);
  return filterOpenApiDocument(baseDoc, {
    surface: 'admin',
    allowedTags: ADMIN_SURFACE_TAGS,
    pathMatcher: isAdminPath,
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
    allowedTags: WEB_SURFACE_TAGS,
    pathMatcher: isWebPath,
    meta: {
      title: `${options.appName} - Web Sale API`,
      description:
        'Public Web Storefront & Sale API for customer storefront (kitty-web-nextjs). Authoritative server-side pricing and inventory availability.',
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
