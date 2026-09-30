import type {
  RentalAvailabilityReader,
  RentalCreationRepository,
  RentalCreationValidator,
  RentalLifecycleRepository,
  RentalOrderReader,
  WebAccountRentalOrdersReader,
} from '../../src/modules/rentals/domain/rental.repository';

export function rentalAvailabilityReaderMock(): jest.Mocked<RentalAvailabilityReader> {
  const reader: jest.Mocked<RentalAvailabilityReader> = {
    getBookableVariant: jest.fn(),
    getBookableVariants: jest.fn(),
    findActiveVariantIdsByProduct: jest.fn(),
    findActiveVariantIdsByProducts: jest.fn(),
  };
  reader.getBookableVariants.mockImplementation(async (input) => {
    const variants = await Promise.all(
      input.variantIds.map(
        async (variantId) =>
          (await reader.getBookableVariant({
            shopId: input.shopId,
            variantId,
            durationDays: input.durationDays,
            from: input.from,
            until: input.until,
            ...(input.storefrontEligibility ? { storefrontEligibility: true as const } : {}),
          })) ?? null,
      ),
    );
    return variants.filter((variant): variant is NonNullable<typeof variant> => variant !== null);
  });
  reader.findActiveVariantIdsByProducts.mockImplementation(
    async (shopId, productIds, storefrontEligibility) => {
      const entries: Array<[string, string[]]> = await Promise.all(
        productIds.map(
          async (productId): Promise<[string, string[]]> => [
            productId,
            await reader.findActiveVariantIdsByProduct(shopId, productId, storefrontEligibility),
          ],
        ),
      );
      return Object.fromEntries(entries);
    },
  );
  return reader;
}

export function rentalCreationRepositoryMock(): jest.Mocked<RentalCreationRepository> {
  return {
    createOrder: jest.fn(),
    claimIdempotency: jest.fn(),
    releaseIdempotency: jest.fn().mockResolvedValue(undefined),
  };
}

export function rentalCreationValidatorMock(): jest.Mocked<RentalCreationValidator> {
  return {
    customerExists: jest.fn().mockResolvedValue(true),
    locationExists: jest.fn().mockResolvedValue(true),
  };
}

export function rentalOrderReaderMock(): jest.Mocked<RentalOrderReader> {
  return {
    list: jest.fn(),
    get: jest.fn(),
    getStatus: jest.fn(),
    getSchedule: jest.fn(),
    getReturnPreview: jest.fn(),
    lookupStorefrontOrder: jest.fn(),
  };
}

export function rentalLifecycleRepositoryMock(): jest.Mocked<RentalLifecycleRepository> {
  return {
    confirm: jest.fn(),
    transition: jest.fn(),
    receiveReturn: jest.fn(),
    settleOrder: jest.fn(),
    reschedule: jest.fn(),
    addCharge: jest.fn(),
    returnCollateral: jest.fn(),
  };
}

export function webAccountRentalOrdersReaderMock(): jest.Mocked<WebAccountRentalOrdersReader> {
  return {
    listWebAccountOrders: jest.fn(),
    getWebAccountOrder: jest.fn(),
  };
}

export function rentalServicePorts() {
  return {
    availability: rentalAvailabilityReaderMock(),
    creation: rentalCreationRepositoryMock(),
    creationValidator: rentalCreationValidatorMock(),
    orderReader: rentalOrderReaderMock(),
    lifecycle: rentalLifecycleRepositoryMock(),
  };
}
