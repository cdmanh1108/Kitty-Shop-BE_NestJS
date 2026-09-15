import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import type {
  SchemaObject,
  ReferenceObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

describe('OpenAPI Contract Baseline', () => {
  const openApiPath = resolve(__dirname, '../generated/openapi.json');

  function loadDocument(): OpenAPIObject {
    const content = readFileSync(openApiPath, 'utf8');
    return JSON.parse(content) as OpenAPIObject;
  }

  it('verifies that generated/openapi.json exists', () => {
    expect(existsSync(openApiPath)).toBe(true);
  });

  it('verifies that OpenAPI document has valid specification structure', () => {
    const document = loadDocument();

    expect(document.openapi).toMatch(/^3\.0\.\d+/);
    expect(document.info).toBeDefined();
    expect(typeof document.info.title).toBe('string');
    expect(typeof document.info.version).toBe('string');
    expect(document.paths).toBeDefined();
    expect(document.components?.schemas).toBeDefined();
  });

  it('documents all required authentication endpoints under canonical /admin/auth', () => {
    const document = loadDocument();

    expect(document.paths['/admin/auth/login']?.post).toBeDefined();
    expect(document.paths['/admin/auth/refresh']?.post).toBeDefined();
    expect(document.paths['/admin/auth/logout']?.post).toBeDefined();
    expect(document.paths['/admin/auth/me']?.get).toBeDefined();

    // Verify legacy non-admin auth routes do not exist
    expect(document.paths['/auth/login']).toBeUndefined();
    expect(document.paths['/auth/refresh']).toBeUndefined();
    expect(document.paths['/auth/logout']).toBeUndefined();
    expect(document.paths['/auth/me']).toBeUndefined();
  });

  it('documents core domain routes under canonical /admin/* namespace', () => {
    const document = loadDocument();
    const paths = document.paths;

    // Canonical /admin routes exist
    expect(paths['/admin/rental-orders']?.get).toBeDefined();
    expect(paths['/admin/rental-orders']?.post).toBeDefined();
    expect(paths['/admin/products']?.get).toBeDefined();
    expect(paths['/admin/customers']?.get).toBeDefined();
    expect(paths['/admin/customers']?.post).toBeDefined();
    expect(paths['/admin/customers/lookup']?.get).toBeDefined();
    expect(paths['/admin/customers/{id}']?.get).toBeDefined();
    expect(paths['/admin/customers/{id}']?.patch).toBeDefined();
    expect(paths['/admin/inventory']?.get).toBeDefined();
    expect(paths['/admin/inventory/availability/search']?.get).toBeDefined();
    expect(paths['/admin/payments']?.get).toBeDefined();
    expect(paths['/admin/expenses']?.get).toBeDefined();
    expect(paths['/admin/deliveries']?.get).toBeDefined();
    expect(paths['/admin/reminders']?.get).toBeDefined();
    expect(paths['/admin/reports/revenue']?.get).toBeDefined();
    expect(paths['/admin/dashboard/summary']?.get).toBeDefined();

    // Legacy non-admin routes must NOT exist
    expect(paths['/rental-orders']).toBeUndefined();
    expect(paths['/products']).toBeUndefined();
    expect(paths['/customers']).toBeUndefined();
    expect(paths['/inventory']).toBeUndefined();
    expect(paths['/payments']).toBeUndefined();
    expect(paths['/expenses']).toBeUndefined();
    expect(paths['/deliveries']).toBeUndefined();
    expect(paths['/reminders']).toBeUndefined();
    expect(paths['/reports/revenue']).toBeUndefined();
    expect(paths['/dashboard/summary']).toBeUndefined();

    // System routes must not be in admin contract
    expect(paths['/health/live']).toBeUndefined();
    expect(paths['/health/ready']).toBeUndefined();
  });

  it('documents canonical common response schemas', () => {
    const document = loadDocument();
    const schemas = document.components?.schemas;

    expect(schemas).toBeDefined();
    const paginationMeta = schemas?.PaginationMetaResDto as SchemaObject | undefined;
    expect(paginationMeta).toBeDefined();
    expect(paginationMeta?.properties?.page).toBeDefined();
    expect(paginationMeta?.properties?.limit).toBeDefined();
    expect(paginationMeta?.properties?.total).toBeDefined();
    expect(paginationMeta?.properties?.totalPages).toBeDefined();

    const errorRes = schemas?.ErrorResDto as SchemaObject | undefined;
    expect(errorRes).toBeDefined();
    expect(errorRes?.properties?.statusCode).toBeDefined();
    expect(errorRes?.properties?.code).toBeDefined();
    expect(errorRes?.properties?.message).toBeDefined();

    expect(schemas?.LoginReqDto).toBeDefined();
    expect(schemas?.LoginResDto).toBeDefined();
    expect(schemas?.AuthUserResDto).toBeDefined();
  });

  it('defines every nested rental response instead of generic objects', () => {
    const schemas = loadDocument().components?.schemas ?? {};
    const visited = new Set<string>();
    function inspect(schema: SchemaObject | ReferenceObject): void {
      if ('$ref' in schema) {
        const name = schema.$ref.replace('#/components/schemas/', '');
        if (visited.has(name)) return;
        visited.add(name);
        const referenced = schemas[name];
        if (!referenced) throw new Error(`Missing response schema ${name}`);
        inspect(referenced);
        return;
      }
      // Swagger represents nullable DTOs as an object composed from a referenced schema.
      // Inspect those schemas recursively below, while still rejecting untyped objects.
      if (schema.type === 'object' && !schema.properties)
        expect((schema.allOf ?? schema.oneOf ?? schema.anyOf ?? []).length).toBeGreaterThan(0);
      if (schema.type === 'array') {
        if (!schema.items) throw new Error('Array response must define items');
        inspect(schema.items);
      }
      for (const property of Object.values(schema.properties ?? {})) inspect(property);
      for (const child of [
        ...(schema.allOf ?? []),
        ...(schema.oneOf ?? []),
        ...(schema.anyOf ?? []),
      ])
        inspect(child);
    }
    inspect({ $ref: '#/components/schemas/RentalOrderPageResDto' });
    inspect({ $ref: '#/components/schemas/RentalOrderResDto' });
    inspect({ $ref: '#/components/schemas/CustomerPageResDto' });
    inspect({ $ref: '#/components/schemas/CustomerDetailResDto' });
    inspect({ $ref: '#/components/schemas/CustomerLookupItemResDto' });
  });
});
