import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

describe('Web Sale API Security Boundary', () => {
  const webDocPath = resolve(__dirname, '../../generated/openapi-web.json');
  const webDoc = JSON.parse(readFileSync(webDocPath, 'utf8')) as OpenAPIObject;

  it('contains NO admin routes under /web specifications', () => {
    const paths = Object.keys(webDoc.paths);

    const forbiddenPrefixes = [
      '/admin',
      '/finance',
      '/audit',
      '/reports',
      '/members',
      '/reminders',
      '/inventory',
      '/deliveries',
    ];

    for (const path of paths) {
      for (const prefix of forbiddenPrefixes) {
        expect(path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it('exposes only public safe properties in all DTO schemas', () => {
    const schemas = webDoc.components?.schemas ?? {};

    const forbiddenFields = [
      'purchasePrice',
      'costPrice',
      'replacementValue',
      'barcode',
      'inventoryItemId',
      'actorUserId',
      'actorMemberId',
      'staffId',
      'internalNote',
      'passwordHash',
      'hashedPassword',
      'token',
    ];

    for (const [schemaName, schemaObj] of Object.entries(schemas)) {
      const typedObj = schemaObj as SchemaObject;
      const properties = Object.keys(typedObj.properties ?? {});
      for (const forbidden of forbiddenFields) {
        expect({
          schema: schemaName,
          field: forbidden,
          hasForbidden: properties.includes(forbidden),
        }).toEqual({
          schema: schemaName,
          field: forbidden,
          hasForbidden: false,
        });
      }
    }
  });

  it('has no default bearer authorization configured for public storefront', () => {
    expect(webDoc.security).toBeUndefined();
    expect(webDoc.components?.securitySchemes).toBeUndefined();
  });
});
