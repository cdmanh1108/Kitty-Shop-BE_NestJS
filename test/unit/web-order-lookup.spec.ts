import { NotFoundException } from '@nestjs/common';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import type { RentalRepository } from '../../src/modules/rentals/domain/rental.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

interface MockPrisma {
  rentalOrder: {
    findFirst: jest.Mock;
  };
  paymentTransaction: {
    aggregate: jest.Mock;
  };
}

describe('Web Order Lookup Security and Behavior', () => {
  let service: WebRentalService;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = {
      rentalOrder: {
        findFirst: jest.fn(),
      },
      paymentTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 150000 } }),
      },
    };

    service = new WebRentalService(
      {} as RentalRepository,
      mockPrisma as unknown as PrismaService,
    );
  });

  it('successfully returns sanitized order details when orderCode and phone match', async () => {
    mockPrisma.rentalOrder.findFirst.mockResolvedValue({
      id: 'order-uuid-1',
      orderNumber: 'RT-20260920-001',
      status: 'CONFIRMED',
      grandTotal: 450000,
      depositRequired: 500000,
      rentalStartAt: new Date('2026-09-20T09:00:00.000Z'),
      rentalEndAt: new Date('2026-09-23T18:00:00.000Z'),
      internalNote: 'Khách VIP, cần kiểm tra kỹ trước khi giao',
      customer: {
        id: 'cust-1',
        fullName: 'Nguyễn Thị Mai',
        phone: '0912345678',
        normalizedPhone: '0912345678',
      },
      items: [
        {
          productNameSnapshot: 'Đầm dạ hội đỏ',
          quantity: 1,
          product: {
            media: [{ url: 'https://img.com/red-dress.jpg' }],
          },
        },
      ],
    });

    const result = await service.lookupOrder('shop-1', {
      orderCode: 'RT-20260920-001',
      phone: '0912345678',
    });

    expect(result.orderCode).toBe('RT-20260920-001');
    expect(result.customerName).toBe('Nguyễn Thị Mai');
    expect(result.phoneMasked).toBe('091****678');
    expect(result.pickupDate).toBe('2026-09-20');
    expect(result.returnDate).toBe('2026-09-23');
    expect(result.status).toBe('confirmed');
    expect(result.totalAmount).toBe(450000);
    expect(result.depositAmount).toBe(500000);
    expect(result.paidAmount).toBe(150000);
    expect(result.items).toEqual([
      {
        name: 'Đầm dạ hội đỏ',
        imageUrl: 'https://img.com/red-dress.jpg',
        quantity: 1,
      },
    ]);

    // Ensure private notes / staff info are NOT exposed
    expect(result).not.toHaveProperty('internalNote');
    expect(result).not.toHaveProperty('customerId');
  });

  it('rejects with NotFoundException when phone number does not match order owner', async () => {
    mockPrisma.rentalOrder.findFirst.mockResolvedValue({
      id: 'order-uuid-1',
      orderNumber: 'RT-20260920-001',
      customer: {
        id: 'cust-1',
        fullName: 'Nguyễn Thị Mai',
        phone: '0912345678',
        normalizedPhone: '0912345678',
      },
      items: [],
    });

    // An attacker trying a random/wrong phone number for a known order number
    await expect(
      service.lookupOrder('shop-1', {
        orderCode: 'RT-20260920-001',
        phone: '0987654321', // mismatching phone
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects with NotFoundException when orderCode does not exist', async () => {
    mockPrisma.rentalOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.lookupOrder('shop-1', {
        orderCode: 'NON-EXISTENT-CODE',
        phone: '0912345678',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
