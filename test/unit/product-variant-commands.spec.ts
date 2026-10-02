import { Prisma } from '@prisma/client';
import { CatalogInvariantError } from '../../src/modules/catalog/domain/catalog-errors';
import { mapProductVariantDeleteError } from '../../src/modules/catalog/infrastructure/product-variant-commands';

describe('ProductVariant delete race mapping', () => {
  it('maps a foreign-key failure after the usage pre-check to PRODUCT_VARIANT_IN_USE', () => {
    const error = new Prisma.PrismaClientKnownRequestError('foreign key conflict', {
      code: 'P2003',
      clientVersion: '6.19.3',
    });
    let caught: unknown;

    try {
      mapProductVariantDeleteError(error);
    } catch (cause) {
      caught = cause;
    }

    expect(caught).toBeInstanceOf(CatalogInvariantError);
    expect(caught).toMatchObject({
      code: 'PRODUCT_VARIANT_IN_USE',
      kind: 'CONFLICT',
    });
    expect(String(caught)).not.toContain('P2003');
  });
});
