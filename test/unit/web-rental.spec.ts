import { Prisma } from '@prisma/client';
import { WebRentalEvaluationService } from '../../src/modules/rentals/application/web-rental-evaluation.service';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import { WebRentalLookupService } from '../../src/modules/rentals/application/web-rental-lookup.service';
import type { CreateRentalOrderData } from '../../src/modules/rentals/domain/ports/rental-creation.port';
import type { RentalPolicyProvider } from '../../src/modules/settings/domain/rental-policy';
import type { CustomerRepository } from '../../src/modules/customers/domain/customer.repository';
import { InvalidCustomerPhoneError } from '../../src/modules/customers/domain/customer-phone';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import {
  InvalidRentalInputError,
  RentalOperationConflictError,
} from '../../src/modules/rentals/application/rental.errors';
import {
  rentalAvailabilityReaderMock,
  rentalCreationRepositoryMock,
  rentalOrderReaderMock,
} from '../fixtures/rental-ports.fixture';
import { rentalOrderDetailsFixture } from '../fixtures/rental-order.fixture';

describe('Web rental use cases', () => {
  let evaluationService: WebRentalEvaluationService;
  let orderService: WebRentalOrderService;
  let lookupService: WebRentalLookupService;
  let creation: ReturnType<typeof rentalCreationRepositoryMock>;
  let availability: ReturnType<typeof rentalAvailabilityReaderMock>;
  let orderReader: ReturnType<typeof rentalOrderReaderMock>;
  let mockPolicyProvider: {
    getPolicy: jest.Mock;
  };
  let mockCustomerRepo: {
    resolveForBooking: jest.Mock;
  };

  beforeEach(() => {
    creation = rentalCreationRepositoryMock();
    creation.claimIdempotency.mockResolvedValue({ state: 'CLAIMED', claimId: 'claim-1' });
    availability = rentalAvailabilityReaderMock();
    orderReader = rentalOrderReaderMock();

    mockPolicyProvider = {
      getPolicy: jest.fn().mockResolvedValue(DEFAULT_RENTAL_POLICY),
    };

    mockCustomerRepo = {
      resolveForBooking: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    };

    evaluationService = new WebRentalEvaluationService(
      availability,
      mockPolicyProvider as unknown as RentalPolicyProvider,
    );
    orderService = new WebRentalOrderService(
      creation,
      availability,
      mockPolicyProvider as unknown as RentalPolicyProvider,
      mockCustomerRepo as unknown as CustomerRepository,
      { now: () => new Date('2026-09-20T00:00:00.000Z') },
    );
    lookupService = new WebRentalLookupService(orderReader);
  });

  function firstCreateOrderInput(): CreateRentalOrderData {
    const calls: unknown = creation.createOrder.mock.calls;
    if (!Array.isArray(calls) || !Array.isArray(calls[0]))
      throw new Error('Expected createOrder call');
    return calls[0][0] as CreateRentalOrderData;
  }

  describe('checkAvailability', () => {
    it('rejects invalid calendar dates before catalog access', async () => {
      await expect(
        evaluationService.checkAvailability('shop-1', {
          pickupDate: '2026-02-29',
          returnDate: '2026-03-01',
          variantId: 'var-1',
        }),
      ).rejects.toThrow(InvalidRentalInputError);
      expect(availability.getBookableVariant.mock.calls).toHaveLength(0);
      expect(availability.findActiveVariantIdsByProduct.mock.calls).toHaveLength(0);
    });

    it('throws Error if pickupDate is equal to or after returnDate', async () => {
      await expect(
        evaluationService.checkAvailability('shop-1', {
          pickupDate: '2026-09-25',
          returnDate: '2026-09-20',
          variantId: 'var-1',
        }),
      ).rejects.toThrow(InvalidRentalInputError);
    });

    it('returns availability and count for a specific variant', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: null,
        depositPerItem: 0,
        availableInventory: [
          { id: 'inv-1', sku: 'SKU-1' },
          { id: 'inv-2', sku: 'SKU-2' },
        ],
      });

      const result = await evaluationService.checkAvailability('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        variantId: 'var-1',
      });

      expect(result.available).toBe(true);
      expect(result.availableQuantity).toBe(2);
      expect(availability.getBookableVariant.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          shopId: 'shop-1',
          variantId: 'var-1',
          durationDays: 3,
          storefrontEligibility: true,
        }),
      );
    });

    it('does not aggregate availability across ambiguous product variants', async () => {
      availability.findActiveVariantIdsByProduct.mockResolvedValue(['v-1', 'v-2']);
      const result = await evaluationService.checkAvailability('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        productId: 'prod-1',
      });

      expect(result).toEqual({ available: false, availableQuantity: 0 });
      expect(availability.findActiveVariantIdsByProduct.mock.calls[0]).toEqual([
        'shop-1',
        'prod-1',
        true,
      ]);
      expect(availability.getBookableVariant.mock.calls).toHaveLength(0);
    });

    it('uses productId as a compatibility alias only for one eligible variant', async () => {
      availability.findActiveVariantIdsByProduct.mockResolvedValue(['var-1']);
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: null,
        depositPerItem: 0,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }],
      });

      await expect(
        evaluationService.checkAvailability('shop-1', {
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          productId: 'prod-1',
        }),
      ).resolves.toEqual({ available: true, availableQuantity: 1 });
    });
  });

  describe('calculateQuote', () => {
    it('rejects oversized item quantities before policy or catalog access', async () => {
      await expect(
        evaluationService.calculateQuote('shop-1', {
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 21 }],
        }),
      ).rejects.toThrow(InvalidRentalInputError);
      expect(mockPolicyProvider.getPolicy).not.toHaveBeenCalled();
      expect(availability.getBookableVariant.mock.calls).toHaveLength(0);
    });

    it('uses unified shipping fee from RentalPolicy single source of truth', async () => {
      mockPolicyProvider.getPolicy.mockResolvedValue({
        ...DEFAULT_RENTAL_POLICY,
        delivery: { standardShippingFee: 45000 },
      });

      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [
          { id: 'inv-1', sku: 'SKU-1' },
          { id: 'inv-2', sku: 'SKU-2' },
        ],
      });

      const result = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 2 }],
        deliveryMethod: 'shop_delivery',
      });

      expect(result.durationDays).toBe(3);
      expect(result.rentalSubtotal).toBe(140000); // (50000 + 2 * 10000) * 2
      expect(result.depositAmount).toBe(1000000); // 500000 * 2
      expect(result.shippingFee).toBe(45000); // from policy
      expect(result.totalAmount).toBe(185000); // rentalSubtotal + shippingFee
      expect(result.available).toBe(true);
    });

    it('sets available to false if requested quantity exceeds available stock', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }], // only 1 available
      });

      const result = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 2 }],
        deliveryMethod: 'self_pickup',
      });

      expect(result.available).toBe(false);
      expect(result.canCheckout).toBe(false);
      expect(result.items).toEqual([
        {
          productId: 'prod-1',
          variantId: 'var-1',
          requestedQuantity: 2,
          availableQuantity: 1,
          available: false,
          issue: 'INSUFFICIENT_QUANTITY',
          unitRentalPrice: 70000,
          lineTotal: 140000,
          depositAmount: 1000000,
        },
      ]);
      expect(result.shippingFee).toBe(0);
    });

    it('returns ordered per-line availability and canonical pricing for multiple variants', async () => {
      availability.getBookableVariant
        .mockResolvedValueOnce({
          id: 'var-2',
          productId: 'prod-2',
          variantCode: 'DR-M',
          productName: 'Dress M',
          productKind: 'PRODUCT',
          sizeName: 'M',
          colorName: null,
          ratePrice: 100000,
          depositPerItem: 250000,
          availableInventory: [
            { id: 'inv-2', sku: 'SKU-2' },
            { id: 'inv-3', sku: 'SKU-3' },
          ],
        })
        .mockResolvedValueOnce({
          id: 'var-3',
          productId: 'prod-3',
          variantCode: 'DR-L',
          productName: 'Dress L',
          productKind: 'PRODUCT',
          sizeName: 'L',
          colorName: null,
          ratePrice: 100000,
          depositPerItem: 100000,
          availableInventory: [{ id: 'inv-4', sku: 'SKU-4' }],
        })
        .mockResolvedValueOnce({
          id: 'var-1',
          productId: 'prod-1',
          variantCode: 'DR-S',
          productName: 'Dress S',
          productKind: 'PRODUCT',
          sizeName: 'S',
          colorName: null,
          ratePrice: 200000,
          depositPerItem: 300000,
          availableInventory: [],
        });

      const result = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [
          { productId: 'prod-2', variantId: 'var-2', quantity: 2 },
          { productId: 'prod-3', variantId: 'var-3', quantity: 1 },
          { productId: 'prod-1', variantId: 'var-1', quantity: 1 },
        ],
        deliveryMethod: 'self_pickup',
      });

      expect(availability.getBookableVariants.mock.calls).toHaveLength(1);
      expect(availability.getBookableVariants.mock.calls[0]?.[0].variantIds).toEqual([
        'var-2',
        'var-3',
        'var-1',
      ]);
      expect(result).toMatchObject({
        durationDays: 3,
        rentalSubtotal: 280000,
        depositAmount: 900000,
        totalAmount: 280000,
        available: false,
        canCheckout: false,
      });
      expect(result.items).toEqual([
        {
          productId: 'prod-2',
          variantId: 'var-2',
          requestedQuantity: 2,
          availableQuantity: 2,
          available: true,
          unitRentalPrice: 70000,
          lineTotal: 140000,
          depositAmount: 500000,
        },
        {
          productId: 'prod-3',
          variantId: 'var-3',
          requestedQuantity: 1,
          availableQuantity: 1,
          available: true,
          unitRentalPrice: 70000,
          lineTotal: 70000,
          depositAmount: 100000,
        },
        {
          productId: 'prod-1',
          variantId: 'var-1',
          requestedQuantity: 1,
          availableQuantity: 0,
          available: false,
          issue: 'INSUFFICIENT_QUANTITY',
          unitRentalPrice: 70000,
          lineTotal: 70000,
          depositAmount: 300000,
        },
      ]);
    });

    it('returns a line issue when the selected variant is no longer rentable', async () => {
      availability.getBookableVariant.mockResolvedValue(null);

      const result = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ productId: 'prod-1', variantId: 'var-1', quantity: 1 }],
      });

      expect(result).toMatchObject({ available: false, canCheckout: false, rentalSubtotal: 0 });
      expect(result.items).toEqual([
        {
          productId: 'prod-1',
          variantId: 'var-1',
          requestedQuantity: 1,
          availableQuantity: 0,
          available: false,
          issue: 'NOT_RENTABLE',
        },
      ]);
    });

    it('rejects a non-positive or fractional rental quantity before pricing', async () => {
      await expect(
        evaluationService.calculateQuote('shop-1', {
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 0 }],
          deliveryMethod: 'self_pickup',
        }),
      ).rejects.toThrow(InvalidRentalInputError);

      await expect(
        evaluationService.calculateQuote('shop-1', {
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 1.5 }],
          deliveryMethod: 'self_pickup',
        }),
      ).rejects.toThrow(InvalidRentalInputError);
    });

    it('merges duplicate variant demand before checking stock and calculating price', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }],
      });

      const result = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [
          { variantId: 'var-1', quantity: 1 },
          { variantId: 'var-1', quantity: 1 },
        ],
        deliveryMethod: 'self_pickup',
      });

      expect(result).toMatchObject({
        available: false,
        rentalSubtotal: 140000,
        depositAmount: 1000000,
        canCheckout: false,
        items: [
          {
            productId: 'prod-1',
            variantId: 'var-1',
            requestedQuantity: 2,
            availableQuantity: 1,
            issue: 'INSUFFICIENT_QUANTITY',
          },
        ],
      });
    });

    it('validates every product/variant pair before merging duplicate variants', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }],
      });

      await expect(
        evaluationService.calculateQuote('shop-1', {
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [
            { productId: 'prod-1', variantId: 'var-1', quantity: 1 },
            { productId: 'another-product', variantId: 'var-1', quantity: 1 },
          ],
        }),
      ).rejects.toThrow(InvalidRentalInputError);
    });
  });

  describe('createOrder', () => {
    it('rejects invalid calendar dates before an idempotency claim', async () => {
      await expect(
        orderService.createOrder(
          'shop-1',
          {
            customer: { name: 'Nguyễn Văn A', phone: '0912345678' },
            pickupDate: '2026-04-31',
            returnDate: '2026-05-02',
            items: [{ variantId: 'var-1', quantity: 1 }],
            delivery: { method: 'self_pickup' },
            paymentMethod: 'cash',
          },
          'web-invalid-calendar',
        ),
      ).rejects.toThrow(InvalidRentalInputError);
      expect(creation.claimIdempotency.mock.calls).toHaveLength(0);
    });

    const webOrderInput = () => ({
      customer: { name: 'Trần Thị B', phone: '0987654321' },
      pickupDate: '2026-09-20',
      returnDate: '2026-09-23',
      items: [{ variantId: 'var-1', quantity: 1 }],
      delivery: { method: 'self_pickup' as const },
      paymentMethod: 'cash' as const,
    });

    it('requires an opaque idempotency key before any customer or booking work', async () => {
      await expect(orderService.createOrder('shop-1', webOrderInput())).rejects.toThrow(Error);
      expect(creation.claimIdempotency.mock.calls).toHaveLength(0);
      expect(mockCustomerRepo.resolveForBooking).not.toHaveBeenCalled();
      expect(creation.createOrder.mock.calls).toHaveLength(0);
    });

    it('rejects ambiguous multi-value keys before claiming', async () => {
      await expect(
        orderService.createOrder('shop-1', webOrderInput(), ['key-a', 'key-b']),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
      expect(creation.claimIdempotency.mock.calls).toHaveLength(0);
    });

    it('replays the stored Web-safe result before selection or customer resolution', async () => {
      creation.claimIdempotency.mockResolvedValue({
        state: 'COMPLETED',
        responseBody: {
          version: 1,
          kind: 'web-rental-order-create',
          result: {
            orderCode: 'RT-REPLAY',
            totalAmount: 250000,
            depositAmount: 600000,
            status: 'reserved',
            paymentStatus: 'unpaid',
          },
        },
      });

      await expect(
        orderService.createOrder('shop-1', webOrderInput(), 'web-replay-key'),
      ).resolves.toEqual({
        orderCode: 'RT-REPLAY',
        totalAmount: 250000,
        depositAmount: 600000,
        status: 'reserved',
        paymentStatus: 'unpaid',
      });
      expect(availability.getBookableVariant.mock.calls).toHaveLength(0);
      expect(mockCustomerRepo.resolveForBooking).not.toHaveBeenCalled();
      expect(creation.createOrder.mock.calls).toHaveLength(0);
    });

    it('returns a machine-readable conflict when the retained key has another command hash', async () => {
      creation.claimIdempotency.mockResolvedValue({ state: 'HASH_MISMATCH' });

      await expect(
        orderService.createOrder('shop-1', webOrderInput(), 'web-reused-key'),
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
      expect(availability.getBookableVariant.mock.calls).toHaveLength(0);
    });

    it('validates phone and rejects if available stock is insufficient', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 200000,
        depositPerItem: 500000,
        availableInventory: [], // none available!
      });

      await expect(
        orderService.createOrder(
          'shop-1',
          {
            customer: { name: 'Nguyễn Văn A', phone: '0912345678' },
            pickupDate: '2026-09-20',
            returnDate: '2026-09-23',
            items: [{ variantId: 'var-1', quantity: 1 }],
            delivery: { method: 'self_pickup' },
            paymentMethod: 'bank_transfer',
          },
          'web-test-stock',
        ),
      ).rejects.toThrow(RentalOperationConflictError);
      expect(mockCustomerRepo.resolveForBooking).not.toHaveBeenCalled();
    });

    it('creates order with paymentStatus: unpaid and does not fake payment success', async () => {
      mockCustomerRepo.resolveForBooking.mockResolvedValue({ id: 'cust-new' });

      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Váy công chúa',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 250000,
        depositPerItem: 600000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });

      creation.createOrder.mockResolvedValue(
        rentalOrderDetailsFixture({
          orderNumber: 'RT-20260920-001',
          grandTotal: new Prisma.Decimal(70000),
          depositRequired: new Prisma.Decimal(600000),
        }),
      );

      const res = await orderService.createOrder(
        'shop-1',
        {
          customer: { name: 'Trần Thị B', phone: '0987654321' },
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 1 }],
          delivery: { method: 'self_pickup' },
          paymentMethod: 'bank_transfer',
          collateral: { method: 'CASH' },
        },
        'web-test-create',
      );

      expect(res.orderCode).toBe('RT-20260920-001');
      expect(res.totalAmount).toBe(70000);
      expect(res.depositAmount).toBe(600000);
      expect(res.status).toBe('reserved');
      expect(res.paymentStatus).toBe('unpaid');
      expect(mockCustomerRepo.resolveForBooking).toHaveBeenCalledWith({
        shopId: 'shop-1',
        fullName: 'Trần Thị B',
        phone: '0987654321',
        email: undefined,
        facebook: undefined,
      });
      expect(firstCreateOrderInput().preferredPaymentMethod).toBe('bank_transfer');
      expect(firstCreateOrderInput().source).toBe('ONLINE');
    });

    it('maps only the typed invalid-phone error from the resolver to a client error', async () => {
      mockCustomerRepo.resolveForBooking.mockRejectedValue(new InvalidCustomerPhoneError());
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Váy công chúa',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 250000,
        depositPerItem: 600000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });

      await expect(
        orderService.createOrder(
          'shop-1',
          {
            customer: { name: 'Trần Thị B', phone: 'invalid-phone' },
            pickupDate: '2026-09-20',
            returnDate: '2026-09-23',
            items: [{ variantId: 'var-1', quantity: 1 }],
            delivery: { method: 'self_pickup' },
            paymentMethod: 'cash',
          },
          'web-test-invalid-phone',
        ),
      ).rejects.toThrow(InvalidRentalInputError);
      expect(creation.createOrder.mock.calls).toHaveLength(0);
    });

    it('passes delivery shipping once and never mirrors it as an explicit charge', async () => {
      mockPolicyProvider.getPolicy.mockResolvedValue({
        ...DEFAULT_RENTAL_POLICY,
        delivery: { standardShippingFee: 45000 },
      });
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Váy công chúa',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 450000,
        depositPerItem: 600000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });
      creation.createOrder.mockResolvedValue(
        rentalOrderDetailsFixture({
          orderNumber: 'RT-20260920-DELIVERY',
          grandTotal: new Prisma.Decimal(115000),
          depositRequired: new Prisma.Decimal(600000),
        }),
      );

      const quote = await evaluationService.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 1 }],
        deliveryMethod: 'shop_delivery',
      });
      const result = await orderService.createOrder(
        'shop-1',
        {
          customer: { name: 'Trần Thị B', phone: '0987654321' },
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 1 }],
          delivery: { method: 'shop_delivery', address: '1 Nguyễn Huệ' },
          paymentMethod: 'cash',
        },
        'web-test-delivery',
      );

      expect(quote).toMatchObject({
        rentalSubtotal: 70000,
        shippingFee: 45000,
        totalAmount: 115000,
      });
      const createInput = firstCreateOrderInput();
      expect(createInput.source).toBe('ONLINE');
      expect(createInput.storefrontEligibility).toBe(true);
      expect(createInput.charges).toEqual([]);
      expect(createInput.delivery).toMatchObject({
        method: 'DELIVERY',
        addressLine: '1 Nguyễn Huệ',
        shippingFee: 45000,
      });
      expect(result.totalAmount).toBe(115000);
    });

    it('merges duplicate Web lines into one allocation plan', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 250000,
        depositPerItem: 600000,
        availableInventory: [
          { id: 'inv-1', sku: 'SKU-001' },
          { id: 'inv-2', sku: 'SKU-002' },
        ],
      });
      creation.createOrder.mockResolvedValue(
        rentalOrderDetailsFixture({
          orderNumber: 'RT-001',
          grandTotal: new Prisma.Decimal(140000),
          depositRequired: new Prisma.Decimal(1200000),
        }),
      );

      await orderService.createOrder(
        'shop-1',
        {
          customer: { name: 'Trần Thị B', phone: '0987654321' },
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [
            { variantId: 'var-1', quantity: 1 },
            { variantId: 'var-1', quantity: 1 },
          ],
          delivery: { method: 'self_pickup' },
          paymentMethod: 'cash',
        },
        'web-test-duplicates',
      );

      expect(firstCreateOrderInput().lines).toEqual([
        expect.objectContaining({
          variantId: 'var-1',
          quantity: 2,
          lineTotal: 140000,
          depositAmount: 1200000,
          inventory: [
            { id: 'inv-1', sku: 'SKU-001' },
            { id: 'inv-2', sku: 'SKU-002' },
          ],
        }),
      ]);
    });

    it('rejects an explicit variant whose supplied productId is not its parent', async () => {
      availability.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Dress',
        productKind: 'PRODUCT',
        sizeName: null,
        colorName: null,
        ratePrice: 250000,
        depositPerItem: 0,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });

      await expect(
        orderService.createOrder(
          'shop-1',
          {
            customer: { name: 'Trần Thị B', phone: '0987654321' },
            pickupDate: '2026-09-20',
            returnDate: '2026-09-23',
            items: [{ productId: 'prod-2', variantId: 'var-1', quantity: 1 }],
            delivery: { method: 'self_pickup' },
            paymentMethod: 'cash',
          },
          'web-test-parent',
        ),
      ).rejects.toThrow(InvalidRentalInputError);
      expect(creation.createOrder.mock.calls).toHaveLength(0);
    });

    it('rejects collateral method if not allowed by policy', async () => {
      mockPolicyProvider.getPolicy.mockResolvedValue({
        ...DEFAULT_RENTAL_POLICY,
        deposit: {
          ...DEFAULT_RENTAL_POLICY.deposit,
          allowedMethods: ['CASH'], // DOCUMENT not allowed
        },
      });

      await expect(
        orderService.createOrder(
          'shop-1',
          {
            customer: { name: 'Nguyễn Văn A', phone: '0912345678' },
            pickupDate: '2026-09-20',
            returnDate: '2026-09-23',
            items: [{ variantId: 'var-1', quantity: 1 }],
            delivery: { method: 'self_pickup' },
            paymentMethod: 'cash',
            collateral: { method: 'DOCUMENT', documentType: 'CCCD' },
          },
          'web-test-collateral',
        ),
      ).rejects.toThrow(InvalidRentalInputError);
    });
  });

  describe('lookupOrder', () => {
    it('returns masked phone and order details when phone matches', async () => {
      orderReader.lookupStorefrontOrder.mockResolvedValue({
        orderNumber: 'RT-001',
        customerFullName: 'Nguyễn Văn A',
        customerPhone: '0912345678',
        customerNormalizedPhone: '0912345678',
        rentalStartAt: new Date('2026-09-20T00:00:00Z'),
        rentalEndAt: new Date('2026-09-23T00:00:00Z'),
        status: 'reserved',
        grandTotal: 300000,
        depositRequired: 500000,
        paidAmount: 0,
        items: [{ name: 'Váy đỏ', imageUrl: 'https://img.com/1.jpg', quantity: 1 }],
      });

      const res = await lookupService.lookupOrder('shop-1', {
        orderCode: 'RT-001',
        phone: '0912345678',
      });

      expect(res.orderCode).toBe('RT-001');
      expect(res.phoneMasked).toBe('091****678');
      expect(res.customerName).toBe('Nguyễn Văn A');
      expect(res.paidAmount).toBe(0);
    });
  });
});
