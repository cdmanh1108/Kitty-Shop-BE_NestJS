import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';

describe('OpenAPI Separation Specification', () => {
  const adminDocPath = resolve(__dirname, '../../generated/openapi-admin.json');
  const webDocPath = resolve(__dirname, '../../generated/openapi-web.json');
  const compatDocPath = resolve(__dirname, '../../generated/openapi.json');

  function loadDoc(path: string): OpenAPIObject {
    return JSON.parse(readFileSync(path, 'utf8')) as OpenAPIObject;
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

    it('contains only non-web paths and zero /web/ routes', () => {
      const paths = Object.keys(adminDoc.paths);
      expect(paths.length).toBeGreaterThan(0);

      const webLeakedPaths = paths.filter(
        (p) => p.includes('/web/') || p.endsWith('/web'),
      );
      expect(webLeakedPaths).toEqual([]);
    });

    it('contains admin tag names', () => {
      const tags = (adminDoc.tags ?? []).map((t) => t.name);
      const webTags = tags.filter((name) => name.startsWith('Web -'));
      expect(webTags).toEqual([]);
    });
  });

  describe('Web Sale OpenAPI Document', () => {
    const webDoc = loadDoc(webDocPath);

    it('contains Web Sale API title', () => {
      expect(webDoc.info.title).toContain('Web Sale API');
    });

    it('contains only /web/ routes and zero admin routes', () => {
      const paths = Object.keys(webDoc.paths);
      expect(paths.length).toBeGreaterThan(0);

      const nonWebPaths = paths.filter(
        (p) => !p.includes('/web/') && !p.endsWith('/web'),
      );
      expect(nonWebPaths).toEqual([]);
    });

    it('contains only Web tags', () => {
      const tags = (webDoc.tags ?? []).map((t) => t.name);
      for (const tag of tags) {
        expect(tag).toMatch(/^Web - /);
      }
    });

    it('contains only public storefront schemas and isolates internal models', () => {
      const schemas = Object.keys(webDoc.components?.schemas ?? {});
      expect(schemas.length).toBeGreaterThan(0);

      // Must have storefront schemas
      expect(schemas).toContain('WebProductListItemDto');
      expect(schemas).toContain('WebProductDetailDto');
      expect(schemas).toContain('WebRentalQuoteReqDto');
      expect(schemas).toContain('WebRentalQuoteResDto');
      expect(schemas).toContain('WebCreateOrderReqDto');
      expect(schemas).toContain('WebOrderLookupReqDto');
      expect(schemas).toContain('WebOrderLookupResDto');

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
  });

  describe('Backwards Compatibility Document (openapi.json)', () => {
    const adminDoc = loadDoc(adminDocPath);
    const compatDoc = loadDoc(compatDocPath);

    it('preserves same path count as admin OpenAPI for kitty-admin-fe', () => {
      expect(Object.keys(compatDoc.paths).length).toEqual(
        Object.keys(adminDoc.paths).length,
      );
    });
  });
});
