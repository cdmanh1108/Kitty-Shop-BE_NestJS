import { BadRequestException, ConflictException } from '@nestjs/common';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import type { RentalRepository } from '../../src/modules/rentals/domain/rental.repository';
import type { RentalPolicyProvider } from '../../src/modules/settings/domain/rental-policy';
import type { CustomerRepository } from '../../src/modules/customers/domain/customer.repository';
import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';

describe('WebRentalService', () => {
  let service: WebRentalService;
  let mockRepository: {
    getBookableVariant: jest.Mock;
    createOrder: jest.Mock;
    findActiveVariantIdsByProduct: jest.Mock;
    findFirstActiveVariantId: jest.Mock;
    lookupStorefrontOrder: jest.Mock;
  };
  let mockPolicyProvider: {
    getPolicy: jest.Mock;
  };
  let mockCustomerRepo: {
    findByNormalizedPhone: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(() => {
    mockRepository = {
      getBookableVariant: jest.fn(),
      createOrder: jest.fn(),
      findActiveVariantIdsByProduct: jest.fn(),
      findFirstActiveVariantId: jest.fn(),
      lookupStorefrontOrder: jest.fn(),
    };

    mockPolicyProvider = {
      getPolicy: jest.fn().mockResolvedValue(DEFAULT_RENTAL_POLICY),
    };

    mockCustomerRepo = {
      findByNormalizedPhone: jest.fn(),
      create: jest.fn(),
    };

    service = new WebRentalService(
      mockRepository as unknown as RentalRepository,
      mockPolicyProvider as unknown as RentalPolicyProvider,
      mockCustomerRepo as unknown as CustomerRepository,
    );
  });

  describe('checkAvailability', () => {
    it('throws BadRequestException if pickupDate is equal to or after returnDate', async () => {
      await expect(
        service.checkAvailability('shop-1', {
          pickupDate: '2026-09-25',
          returnDate: '2026-09-20',
          variantId: 'var-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns availability and count for a specific variant', async () => {
      mockRepository.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        variantCode: 'DR-S',
        availableInventory: [
          { id: 'inv-1', sku: 'SKU-1' },
          { id: 'inv-2', sku: 'SKU-2' },
        ],
      });

      const result = await service.checkAvailability('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        variantId: 'var-1',
      });

      expect(result.available).toBe(true);
      expect(result.availableQuantity).toBe(2);
      expect(mockRepository.getBookableVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'shop-1',
          variantId: 'var-1',
          durationDays: 3,
        }),
      );
    });

    it('checks availability by productId using repository port without direct Prisma query', async () => {
      mockRepository.findActiveVariantIdsByProduct.mockResolvedValue(['v-1', 'v-2']);
      mockRepository.getBookableVariant
        .mockResolvedValueOnce({
          id: 'v-1',
          availableInventory: [{ id: 'inv-1' }],
        })
        .mockResolvedValueOnce({
          id: 'v-2',
          availableInventory: [{ id: 'inv-2' }, { id: 'inv-3' }],
        });

      const result = await service.checkAvailability('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        productId: 'prod-1',
      });

      expect(result.available).toBe(true);
      expect(result.availableQuantity).toBe(3);
      expect(mockRepository.findActiveVariantIdsByProduct).toHaveBeenCalledWith('shop-1', 'prod-1');
    });
  });

  describe('calculateQuote', () => {
    it('uses unified shipping fee from RentalPolicy single source of truth', async () => {
      mockPolicyProvider.getPolicy.mockResolvedValue({
        ...DEFAULT_RENTAL_POLICY,
        delivery: { standardShippingFee: 45000 },
      });

      mockRepository.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [{ id: 'inv-1' }, { id: 'inv-2' }],
      });

      const result = await service.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 2 }],
        deliveryMethod: 'shop_delivery',
      });

      expect(result.durationDays).toBe(3);
      expect(result.rentalSubtotal).toBe(300000); // 150000 * 2
      expect(result.depositAmount).toBe(1000000); // 500000 * 2
      expect(result.shippingFee).toBe(45000); // from policy
      expect(result.totalAmount).toBe(345000); // rentalSubtotal + shippingFee
      expect(result.available).toBe(true);
    });

    it('sets available to false if requested quantity exceeds available stock', async () => {
      mockRepository.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        ratePrice: 150000,
        depositPerItem: 500000,
        availableInventory: [{ id: 'inv-1' }], // only 1 available
      });

      const result = await service.calculateQuote('shop-1', {
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 2 }],
        deliveryMethod: 'self_pickup',
      });

      expect(result.available).toBe(false);
      expect(result.shippingFee).toBe(0);
    });
  });

  describe('createOrder', () => {
    it('validates phone and rejects if available stock is insufficient', async () => {
      mockCustomerRepo.findByNormalizedPhone.mockResolvedValue({
        id: 'cust-1',
        customerCode: 'CUS-1',
        fullName: 'Nguyễn Văn A',
        phone: '0912345678',
        normalizedPhone: '0912345678',
      });

      mockRepository.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        variantCode: 'DR-S',
        productName: 'Đầm dạ hội',
        ratePrice: 200000,
        depositPerItem: 500000,
        availableInventory: [], // none available!
      });

      await expect(
        service.createOrder('shop-1', {
          customer: { name: 'Nguyễn Văn A', phone: '0912345678' },
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 1 }],
          delivery: { method: 'self_pickup' },
          paymentMethod: 'bank_transfer',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates order with paymentStatus: unpaid and does not fake payment success', async () => {
      mockCustomerRepo.findByNormalizedPhone.mockResolvedValue(null);
      mockCustomerRepo.create.mockResolvedValue({
        id: 'cust-new',
        customerCode: 'CUS-001',
        fullName: 'Trần Thị B',
        phone: '0987654321',
        normalizedPhone: '0987654321',
        email: null,
        facebook: null,
        zalo: null,
        birthday: null,
        gender: null,
        customerType: 'NORMAL',
        status: 'ACTIVE',
        source: 'WEB',
      });

      mockRepository.getBookableVariant.mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Váy công chúa',
        ratePrice: 250000,
        depositPerItem: 600000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });

      mockRepository.createOrder.mockResolvedValue({
        orderNumber: 'RT-20260920-001',
        grandTotal: 250000,
        depositRequired: 600000,
        status: 'RESERVED',
        paymentStatus: 'UNPAID',
      });

      const res = await service.createOrder('shop-1', {
        customer: { name: 'Trần Thị B', phone: '0987654321' },
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 1 }],
        delivery: { method: 'self_pickup' },
        paymentMethod: 'bank_transfer',
        collateral: { method: 'CASH' },
      });

      expect(res.orderCode).toBe('RT-20260920-001');
      expect(res.totalAmount).toBe(250000);
      expect(res.depositAmount).toBe(600000);
      expect(res.status).toBe('reserved');
      expect(res.paymentStatus).toBe('unpaid');
    });

    it('rejects collateral method if not allowed by policy', async () => {
      mockPolicyProvider.getPolicy.mockResolvedValue({
        ...DEFAULT_RENTAL_POLICY,
        deposit: {
          ...DEFAULT_RENTAL_POLICY.deposit,
          allowedMethods: ['CASH'], // DOCUMENT not allowed
        },
      });

      mockCustomerRepo.findByNormalizedPhone.mockResolvedValue({
        id: 'cust-1',
        customerCode: 'CUS-1',
        fullName: 'Nguyễn Văn A',
        phone: '0912345678',
        normalizedPhone: '0912345678',
      });

      await expect(
        service.createOrder('shop-1', {
          customer: { name: 'Nguyễn Văn A', phone: '0912345678' },
          pickupDate: '2026-09-20',
          returnDate: '2026-09-23',
          items: [{ variantId: 'var-1', quantity: 1 }],
          delivery: { method: 'self_pickup' },
          paymentMethod: 'cash',
          collateral: { method: 'DOCUMENT', documentType: 'CCCD' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lookupOrder', () => {
    it('returns masked phone and order details when phone matches', async () => {
      mockRepository.lookupStorefrontOrder.mockResolvedValue({
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

      const res = await service.lookupOrder('shop-1', {
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
