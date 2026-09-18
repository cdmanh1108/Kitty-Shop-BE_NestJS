import type { RentalDetailsResult } from '../../src/modules/rentals/application/rental-read.models';
import { RentalReadPresenter } from '../../src/modules/rentals/application/rental-read.presenter';
import { toRentalResponse } from '../../src/modules/rentals/api/rental.response';
import type { RentalOrderDetails } from '../../src/modules/rentals/domain/rental.models';

const decimal = (value: string) => ({ toString: () => value, toJSON: () => value });

function rental(): RentalDetailsResult {
  return {
    id: 'order-1',
    orderNumber: 'RT-001',
    customerId: 'customer-1',
    rentalStartAt: new Date('2026-09-01T00:00:00.000Z'),
    rentalEndAt: new Date('2026-09-03T00:00:00.000Z'),
    status: 'RETURNED',
    paymentStatus: 'PARTIAL',
    depositStatus: 'RECEIVED',
    grandTotal: '120000',
    itemCount: 1,
    productCount: 1,
    customer: { id: 'customer-1', fullName: 'Customer', phone: '0900000000' },
    confirmation: null,
    rentalSubtotal: '100000',
    chargesTotal: '20000',
    discountTotal: '0',
    depositRequired: '50000',
    collateralMethod: 'CASH',
    documentType: null,
    collateralStatus: 'RECEIVED',
    collateralReceivedAt: new Date('2026-09-01T01:00:00.000Z'),
    collateralReturnedAt: null,
    actualReturnedAt: null,
    paidAmount: '100000',
    remainingAmount: '20000',
    settlement: {
      depositReceived: '50000.00',
      depositAvailable: '50000.00',
      refundAmount: '30000.00',
      amountStillDue: '0.00',
      settlementStatus: 'REFUND_DUE',
    },
    returnRecord: null,
    settlementDetails: null,
    note: null,
    internalNote: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        variantId: 'variant-1',
        productNameSnapshot: 'Dress',
        variantNameSnapshot: 'M / Red',
        quantity: 1,
        status: 'RETURNED',
        imageUrl: 'https://assets.example.com/dress.jpg',
        unitRentalPrice: '100000',
        depositAmount: '50000',
        lineTotal: '100000',
        allocations: [],
      },
    ],
    charges: [],
    payments: [],
    deliveries: [],
    statusHistory: [],
  };
}

describe('rental response mapper', () => {
  it('is a deterministic pure mapping of the application read result', () => {
    const input = rental();

    expect(toRentalResponse(input)).toEqual(toRentalResponse(input));
    expect(toRentalResponse(input)).toMatchObject({
      grandTotal: '120000',
      paidAmount: '100000',
      remainingAmount: '20000',
      items: [{ imageUrl: 'https://assets.example.com/dress.jpg' }],
      rentalStartAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('prepares money totals and public media URLs before pure API mapping', () => {
    const mediaUrls = { resolve: jest.fn().mockReturnValue('https://cdn.example.com/dress.jpg') };
    const raw = {
      ...rental(),
      grandTotal: decimal('120000.00'),
      rentalSubtotal: decimal('100000.00'),
      chargesTotal: decimal('20000.00'),
      discountTotal: decimal('0.00'),
      depositRequired: decimal('50000.00'),
      settlement: null,
      payments: [
        {
          source: 'MANUAL',
          createdBy: null,
          note: null,
          id: 'payment-1',
          transactionNumber: 'PM-001',
          direction: 'IN',
          purpose: 'RENTAL',
          paymentMethod: 'CASH',
          amount: decimal('100000.00'),
          currency: 'VND',
          paidAt: new Date('2026-09-01T01:00:00.000Z'),
        },
      ],
      items: [
        {
          ...rental().items[0],
          unitRentalPrice: decimal('100000.00'),
          depositAmount: decimal('50000.00'),
          lineTotal: decimal('100000.00'),
          imageUrl: 'https://drive.google.com/legacy-thumbnail',
          variant: {
            media: [
              { url: 'https://legacy.example.com/dress.jpg', storageKey: 'shops/a/dress.jpg' },
            ],
          },
          allocations: [],
        },
      ],
    } as unknown as NonNullable<RentalOrderDetails>;

    const result = new RentalReadPresenter(mediaUrls).details(raw);

    expect(mediaUrls.resolve).toHaveBeenCalledWith({
      url: 'https://legacy.example.com/dress.jpg',
      storageKey: 'shops/a/dress.jpg',
    });
    expect(result).toMatchObject({
      paidAmount: '100000',
      remainingAmount: '20000',
      items: [{ imageUrl: 'https://cdn.example.com/dress.jpg' }],
    });
  });
});
