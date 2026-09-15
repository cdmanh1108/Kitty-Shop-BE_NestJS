import { BadRequestException, ConflictException } from '@nestjs/common';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import type { RentalRepository } from '../../src/modules/rentals/domain/rental.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

interface MockPrisma {
  productVariant: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  customer: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  rentalOrder: {
    findFirst: jest.Mock;
  };
  paymentTransaction: {
    aggregate: jest.Mock;
  };
}

describe('WebRentalService', () => {
  let service: WebRentalService;
  let mockRepository: jest.Mocked<Partial<RentalRepository>>;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockRepository = {
      getBookableVariant: jest.fn(),
      createOrder: jest.fn(),
    };

    mockPrisma = {
      productVariant: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      customer: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      rentalOrder: {
        findFirst: jest.fn(),
      },
      paymentTransaction: {
        aggregate: jest.fn(),
      },
    };

    service = new WebRentalService(
      mockRepository as unknown as RentalRepository,
      mockPrisma as unknown as PrismaService,
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
      (mockRepository.getBookableVariant as jest.Mock).mockResolvedValue({
        id: 'var-1',
        variantCode: 'DR-S',
        availableInventory: [{ id: 'inv-1', sku: 'SKU-1' }, { id: 'inv-2', sku: 'SKU-2' }],
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
  });

  describe('calculateQuote', () => {
    it('calculates authoritative pricing and ignores client rates', async () => {
      (mockRepository.getBookableVariant as jest.Mock).mockResolvedValue({
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
      expect(result.shippingFee).toBe(30000); // standard shop delivery
      expect(result.totalAmount).toBe(330000); // rentalSubtotal + shippingFee
      expect(result.available).toBe(true);
    });

    it('sets available to false if requested quantity exceeds available stock', async () => {
      (mockRepository.getBookableVariant as jest.Mock).mockResolvedValue({
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
      mockPrisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        fullName: 'Nguyễn Văn A',
      });

      (mockRepository.getBookableVariant as jest.Mock).mockResolvedValue({
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

    it('creates customer and authoritative order if validation passes', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null);
      mockPrisma.customer.create.mockResolvedValue({
        id: 'cust-new',
        fullName: 'Trần Thị B',
        normalizedPhone: '0987654321',
      });

      (mockRepository.getBookableVariant as jest.Mock).mockResolvedValue({
        id: 'var-1',
        productId: 'prod-1',
        variantCode: 'DR-M',
        productName: 'Váy công chúa',
        ratePrice: 250000,
        depositPerItem: 600000,
        availableInventory: [{ id: 'inv-1', sku: 'SKU-001' }],
      });

      (mockRepository.createOrder as jest.Mock).mockResolvedValue({
        orderNumber: 'RT-20260920-001',
        grandTotal: 250000,
        depositRequired: 600000,
        status: 'RESERVED',
      });

      const res = await service.createOrder('shop-1', {
        customer: { name: 'Trần Thị B', phone: '0987654321' },
        pickupDate: '2026-09-20',
        returnDate: '2026-09-23',
        items: [{ variantId: 'var-1', quantity: 1 }],
        delivery: { method: 'self_pickup' },
        paymentMethod: 'cash',
      });

      expect(res.orderCode).toBe('RT-20260920-001');
      expect(res.totalAmount).toBe(250000);
      expect(res.depositAmount).toBe(600000);
      expect(res.status).toBe('reserved');
    });
  });
});
