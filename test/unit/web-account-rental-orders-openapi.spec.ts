import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';

describe('Web Account Rental Orders OpenAPI response fields', () => {
  const document = JSON.parse(
    readFileSync(resolve(__dirname, '../../generated/openapi-web.json'), 'utf8'),
  ) as OpenAPIObject;

  it('describes nullable response strings as required nullable string properties', () => {
    const schemas = document.components?.schemas as Record<
      string,
      {
        properties?: Record<string, { type?: string; format?: string; nullable?: boolean }>;
        required?: string[];
      }
    >;
    const expectedProperties = [
      { schema: 'WebAccountRentalOrderListItemResDto', name: 'preferredPaymentMethod' },
      { schema: 'WebAccountRentalOrderDeliveryResDto', name: 'scheduledAt', format: 'date-time' },
      { schema: 'WebAccountRentalOrderDeliveryResDto', name: 'recipientName' },
      { schema: 'WebAccountRentalOrderDeliveryResDto', name: 'recipientPhone' },
      { schema: 'WebAccountRentalOrderDeliveryResDto', name: 'addressLine' },
      { schema: 'WebAccountRentalOrderDetailResDto', name: 'documentType' },
      { schema: 'WebAccountRentalOrderDetailResDto', name: 'actualReturnedAt', format: 'date-time' },
    ];

    for (const expected of expectedProperties) {
      const schema = schemas[expected.schema];
      if (!schema) throw new Error(`Missing OpenAPI schema: ${expected.schema}`);
      expect(schema.properties?.[expected.name]).toMatchObject({
        type: 'string',
        nullable: true,
        ...(expected.format ? { format: expected.format } : {}),
      });
      expect(schema.required).toContain(expected.name);
    }
  });
});
