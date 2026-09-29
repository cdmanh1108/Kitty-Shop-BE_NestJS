import type {
  RentalAvailabilityReader,
  RentalCreationRepository,
  RentalCreationValidator,
  RentalLifecycleRepository,
  RentalOrderReader,
  WebAccountRentalOrdersReader,
} from '../../src/modules/rentals/domain/rental.repository';

export function rentalAvailabilityReaderMock(): jest.Mocked<RentalAvailabilityReader> {
  return {
    getBookableVariant: jest.fn(),
    findActiveVariantIdsByProduct: jest.fn(),
  };
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
