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

  it('documents all required authentication endpoints', () => {
    const document = loadDocument();

    expect(document.paths['/auth/login']?.post).toBeDefined();
    expect(document.paths['/auth/refresh']?.post).toBeDefined();
    expect(document.paths['/auth/logout']?.post).toBeDefined();
    expect(document.paths['/auth/me']?.get).toBeDefined();
  });

  it('documents core domain routes and operations', () => {
    const document = loadDocument();
    const paths = document.paths;

    expect(paths['/rental-orders']?.get).toBeDefined();
    expect(paths['/rental-orders']?.post).toBeDefined();
    expect(paths['/products']?.get).toBeDefined();
    expect(paths['/customers']?.get).toBeDefined();
    expect(paths['/inventory']?.get).toBeDefined();
    expect(paths['/inventory/availability/search']?.get).toBeDefined();
    expect(paths['/payments']?.get).toBeDefined();
    expect(paths['/expenses']?.get).toBeDefined();
    expect(paths['/deliveries']?.get).toBeDefined();
    expect(paths['/reminders']?.get).toBeDefined();
    expect(paths['/reports/revenue']?.get).toBeDefined();
    expect(paths['/dashboard/summary']?.get).toBeDefined();
    expect(paths['/health/live']?.get).toBeDefined();
    expect(paths['/health/ready']?.get).toBeDefined();
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
      if (schema.type === 'object') expect(schema.properties).toBeDefined();
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
  });
});
