import { NotFoundException } from '@nestjs/common';
import { WebRentalLookupService } from '../../src/modules/rentals/application/web-rental-lookup.service';
import { rentalOrderReaderMock } from '../fixtures/rental-ports.fixture';

describe('Web Order Lookup Security and Behavior', () => {
  let service: WebRentalLookupService;
  let orderReader: ReturnType<typeof rentalOrderReaderMock>;

  beforeEach(() => {
    orderReader = rentalOrderReaderMock();
    service = new WebRentalLookupService(orderReader);
  });

  it('successfully returns sanitized order details when orderCode and phone match', async () => {
    orderReader.lookupStorefrontOrder.mockResolvedValue({
      orderNumber: 'RT-20260920-001',
      status: 'confirmed',
      grandTotal: 450000,
      depositRequired: 500000,
      paidAmount: 150000,
      rentalStartAt: new Date('2026-09-20T09:00:00.000Z'),
      rentalEndAt: new Date('2026-09-23T18:00:00.000Z'),
      customerFullName: 'Nguyễn Thị Mai',
      customerPhone: '0912345678',
      customerNormalizedPhone: '0912345678',
      items: [
        {
          name: 'Đầm dạ hội đỏ',
          quantity: 1,
          imageUrl: 'https://img.com/red-dress.jpg',
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
    orderReader.lookupStorefrontOrder.mockResolvedValue({
      orderNumber: 'RT-20260920-001',
      status: 'confirmed',
      grandTotal: 450000,
      depositRequired: 500000,
      paidAmount: 0,
      rentalStartAt: new Date('2026-09-20T09:00:00.000Z'),
      rentalEndAt: new Date('2026-09-23T18:00:00.000Z'),
      customerFullName: 'Nguyễn Thị Mai',
      customerPhone: '0912345678',
      customerNormalizedPhone: '0912345678',
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
    orderReader.lookupStorefrontOrder.mockResolvedValue(null);

    await expect(
      service.lookupOrder('shop-1', {
        orderCode: 'NON-EXISTENT-CODE',
        phone: '0912345678',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
