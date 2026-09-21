import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '../../src/config/configuration';

describe('OpenAPI Separation & Production Contract Specification', () => {
  const adminDocPath = resolve(__dirname, '../../generated/openapi-admin.json');
  const webDocPath = resolve(__dirname, '../../generated/openapi-web.json');
  const compatDocPath = resolve(__dirname, '../../generated/openapi.json');

  function loadDoc(path: string): OpenAPIObject {
    return JSON.parse(readFileSync(path, 'utf8')) as OpenAPIObject;
  }

  function verifyAllRefsResolve(doc: OpenAPIObject): string[] {
    const jsonStr = JSON.stringify(doc);
    const refMatches = Array.from(jsonStr.matchAll(/"#\/components\/schemas\/([^"]+)"/g))
      .map((m) => m[1])
      .filter((name): name is string => Boolean(name));
    return refMatches.filter((schemaName) => !doc.components?.schemas?.[schemaName]);
  }

  it('exports both admin and web OpenAPI JSON artifacts', () => {
    expect(existsSync(adminDocPath)).toBe(true);
    expect(existsSync(webDocPath)).toBe(true);
    expect(existsSync(compatDocPath)).toBe(true);
  });

  describe('Admin OpenAPI Document', () => {
    const adminDoc = loadDoc(adminDocPath);

    it('contains admin title and description', () => {
      expect(adminDoc.info.title).toContain('Admin API');
    });

    it('contains only canonical /admin/ paths and zero /web/ routes', () => {
      const paths = Object.keys(adminDoc.paths);
      expect(paths.length).toBeGreaterThan(0);

      const nonAdminPaths = paths.filter((p) => !p.startsWith('/admin/'));
      expect(nonAdminPaths).toEqual([]);

      const webLeakedPaths = paths.filter((p) => p.includes('/web/') || p.endsWith('/web'));
      expect(webLeakedPaths).toEqual([]);
    });

    it('excludes system and health probe endpoints from admin contract', () => {
      const paths = Object.keys(adminDoc.paths);
      const healthPaths = paths.filter((p) => p.includes('health'));
      expect(healthPaths).toEqual([]);
    });

    it('contains admin tag names and excludes web tags', () => {
      const tags = (adminDoc.tags ?? []).map((t) => t.name);
      const webTags = tags.filter((name) => name.startsWith('Web -'));
      expect(webTags).toEqual([]);
      const healthTags = tags.filter((name) => name === 'Health');
      expect(healthTags).toEqual([]);
    });

    it('guarantees every operation in admin contract has x-api-surface="admin"', () => {
      const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
      for (const pathItem of Object.values(adminDoc.paths)) {
        if (!pathItem) continue;
        for (const m of methods) {
          const op = pathItem[m] as Record<string, unknown> | undefined;
          if (op) {
            expect(op['x-api-surface']).toBe('admin');
          }
        }
      }
    });

    it('has zero broken or unresolvable $ref schemas', () => {
      const brokenRefs = verifyAllRefsResolve(adminDoc);
      expect(brokenRefs).toEqual([]);
    });

    it('has unique operationIds across all admin operations', () => {
      const operationIds: string[] = [];
      const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
      for (const pathItem of Object.values(adminDoc.paths)) {
        if (!pathItem) continue;
        for (const m of methods) {
          const op = pathItem[m];
          if (op?.operationId) {
            operationIds.push(op.operationId);
          }
        }
      }
      const uniqueIds = new Set(operationIds);
      expect(uniqueIds.size).toBe(operationIds.length);
    });
  });

  describe('Web Sale OpenAPI Document', () => {
    const webDoc = loadDoc(webDocPath);

    it('contains Web Sale API title', () => {
      expect(webDoc.info.title).toContain('Web Sale API');
    });

    it('contains only /web/ routes and zero admin or system routes', () => {
      const paths = Object.keys(webDoc.paths);
      expect(paths.length).toBe(16);

      const nonWebPaths = paths.filter((p) => !p.includes('/web/') && !p.endsWith('/web'));
      expect(nonWebPaths).toEqual([]);

      const healthPaths = paths.filter((p) => p.includes('health'));
      expect(healthPaths).toEqual([]);
    });

    it('contains only Web tags', () => {
      const tags = (webDoc.tags ?? []).map((t) => t.name);
      for (const tag of tags) {
        expect(tag).toMatch(/^Web - /);
      }
    });

    it('guarantees every operation in web contract has x-api-surface="web"', () => {
      const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
      for (const pathItem of Object.values(webDoc.paths)) {
        if (!pathItem) continue;
        for (const m of methods) {
          const op = pathItem[m] as Record<string, unknown> | undefined;
          if (op) {
            expect(op['x-api-surface']).toBe('web');
          }
        }
      }
    });

    it('has zero broken or unresolvable $ref schemas', () => {
      const brokenRefs = verifyAllRefsResolve(webDoc);
      expect(brokenRefs).toEqual([]);
    });

    it('contains only public storefront schemas and isolates internal models', () => {
      const schemas = Object.keys(webDoc.components?.schemas ?? {});
      expect(schemas.length).toBeGreaterThan(0);

      // Must have storefront schemas
      expect(schemas).toContain('WebProductListItemDto');
      expect(schemas).toContain('WebProductListResDto');
      expect(schemas).toContain('WebPaginationMetaDto');
      expect(schemas).toContain('WebProductDetailDto');
      expect(schemas).toContain('WebRentalQuoteReqDto');
      expect(schemas).toContain('WebRentalQuoteResDto');
      expect(schemas).toContain('WebCreateOrderReqDto');
      expect(schemas).toContain('WebOrderLookupReqDto');
      expect(schemas).toContain('WebOrderLookupResDto');
      expect(schemas).toContain('ErrorResDto');

      // MUST NOT contain internal / admin schemas
      const internalForbiddenKeywords = [
        'User',
        'Member',
        'Staff',
        'Audit',
        'Report',
        'Finance',
        'PaymentTransaction',
        'InventoryItem',
        'ShopMember',
        'Expense',
        'RentalSettlement',
        'RentalConfirmation',
      ];

      for (const forbidden of internalForbiddenKeywords) {
        const found = schemas.filter((s) => s.toLowerCase() === forbidden.toLowerCase());
        expect(found).toEqual([]);
      }
    });

    it('defines standardized, collision-free operationIds for all 8 storefront endpoints', () => {
      const expectedOperationIds: Record<string, { method: 'get' | 'post'; id: string }> = {
        '/web/categories': { method: 'get', id: 'getWebCategories' },
        '/web/products': { method: 'get', id: 'getWebProducts' },
        '/web/products/{slug}': { method: 'get', id: 'getWebProductBySlug' },
        '/web/availability': { method: 'get', id: 'getWebAvailability' },
        '/web/rental/quote': { method: 'post', id: 'createWebRentalQuote' },
        '/web/rental-orders': { method: 'post', id: 'createWebRentalOrder' },
        '/web/rental-orders/lookup': { method: 'post', id: 'lookupWebRentalOrder' },
        '/web/policies': { method: 'get', id: 'getWebPolicies' },
      };

      for (const [pathKey, expected] of Object.entries(expectedOperationIds)) {
        const pathItem = webDoc.paths[pathKey];
        expect(pathItem).toBeDefined();
        const operation = pathItem?.[expected.method];
        expect(operation).toBeDefined();
        expect(operation?.operationId).toBe(expected.id);
      }
    });

    it('documents comprehensive HTTP status codes and ErrorResDto schema references', () => {
      // 1. GET /web/products -> 200, 400
      const productsGet = webDoc.paths['/web/products']?.get;
      expect(productsGet?.responses['200']).toBeDefined();
      expect(productsGet?.responses['400']).toBeDefined();
      expect(JSON.stringify(productsGet?.responses['400'])).toContain(
        '#/components/schemas/ErrorResDto',
      );

      // 2. GET /web/products/{slug} -> 200, 404
      const productSlugGet = webDoc.paths['/web/products/{slug}']?.get;
      expect(productSlugGet?.responses['200']).toBeDefined();
      expect(productSlugGet?.responses['404']).toBeDefined();
      expect(JSON.stringify(productSlugGet?.responses['404'])).toContain(
        '#/components/schemas/ErrorResDto',
      );

      // 3. GET /web/availability -> 200, 400
      const availabilityGet = webDoc.paths['/web/availability']?.get;
      expect(availabilityGet?.responses['200']).toBeDefined();
      expect(availabilityGet?.responses['400']).toBeDefined();

      // 4. POST /web/rental/quote -> 200, 400
      const quotePost = webDoc.paths['/web/rental/quote']?.post;
      expect(quotePost?.responses['200']).toBeDefined();
      expect(quotePost?.responses['400']).toBeDefined();

      // 5. POST /web/rental-orders -> 201, 400, 404, 409
      const orderPost = webDoc.paths['/web/rental-orders']?.post;
      expect(orderPost?.responses['201']).toBeDefined();
      expect(orderPost?.responses['400']).toBeDefined();
      expect(orderPost?.responses['404']).toBeDefined();
      expect(orderPost?.responses['409']).toBeDefined();
      expect(JSON.stringify(orderPost?.responses['409'])).toContain(
        '#/components/schemas/ErrorResDto',
      );

      // 6. POST /web/rental-orders/lookup -> 200, 400, 404
      const lookupPost = webDoc.paths['/web/rental-orders/lookup']?.post;
      expect(lookupPost?.responses['200']).toBeDefined();
      expect(lookupPost?.responses['400']).toBeDefined();
      expect(lookupPost?.responses['404']).toBeDefined();
    });

    it('enforces numeric types for monetary amounts and strict enums in web schemas', () => {
      const schemas = (webDoc.components?.schemas ?? {}) as Record<
        string,
        {
          properties?: Record<string, { type?: string; enum?: string[] }>;
        }
      >;

      // Quote response monetary types
      const quoteRes = schemas['WebRentalQuoteResDto'];
      expect(quoteRes?.properties?.rentalSubtotal?.type).toBe('number');
      expect(quoteRes?.properties?.depositAmount?.type).toBe('number');
      expect(quoteRes?.properties?.shippingFee?.type).toBe('number');
      expect(quoteRes?.properties?.totalAmount?.type).toBe('number');

      // Create order response paymentStatus enum
      const createOrderRes = schemas['WebCreateOrderResDto'];
      expect(createOrderRes?.properties?.paymentStatus?.enum).toEqual([
        'unpaid',
        'paid',
        'partially_paid',
      ]);

      // Delivery method enum
      const deliveryDto = schemas['WebCreateOrderDeliveryDto'];
      expect(deliveryDto?.properties?.method?.enum).toEqual(['self_pickup', 'shop_delivery']);

      // Collateral method and documentType enums
      const collateralDto = schemas['WebCreateOrderCollateralDto'];
      expect(collateralDto?.properties?.method?.enum).toEqual(['CASH', 'DOCUMENT']);
      expect(collateralDto?.properties?.documentType?.enum).toEqual(['CCCD', 'GPLX']);
    });
  });

  describe('Backwards Compatibility Document (openapi.json)', () => {
    const adminDoc = loadDoc(adminDocPath);
    const compatDoc = loadDoc(compatDocPath);

    it('preserves same path count as admin OpenAPI for kitty-admin-fe', () => {
      expect(Object.keys(compatDoc.paths).length).toEqual(Object.keys(adminDoc.paths).length);
    });
  });

  describe('Base Application OpenAPI Surface Completeness', () => {
    it('guarantees 100% of operations in the base document have an explicit x-api-surface set', async () => {
      process.env.SKIP_DATABASE_CONNECT = 'true';
      const [{ createApplication }, { createBaseOpenApiDocument }] = await Promise.all([
        import('../../src/main'),
        import('../../src/common/swagger/openapi'),
      ]);

      const app = await createApplication();
      try {
        const config = app.get(ConfigService<AppConfiguration, true>);
        const baseDoc = createBaseOpenApiDocument(app, {
          appName: config.get('appName', { infer: true }),
          apiPrefix: config.get('apiPrefix', { infer: true }),
        });

        const unclassifiedOperations: string[] = [];
        const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;
        const validSurfaces = new Set(['admin', 'web', 'system']);

        for (const [pathKey, pathItem] of Object.entries(baseDoc.paths)) {
          if (!pathItem) continue;
          for (const m of methods) {
            const op = pathItem[m] as Record<string, unknown> | undefined;
            if (op) {
              const surface = op['x-api-surface'];
              if (!surface || typeof surface !== 'string' || !validSurfaces.has(surface)) {
                unclassifiedOperations.push(
                  `${m.toUpperCase()} ${pathKey} (surface=${String(surface)})`,
                );
              }
            }
          }
        }

        expect(unclassifiedOperations).toEqual([]);
      } finally {
        await app.close();
      }
    });
  });
});
