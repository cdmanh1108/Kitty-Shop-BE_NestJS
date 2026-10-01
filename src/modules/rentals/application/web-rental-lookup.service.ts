import { Inject, Injectable } from '@nestjs/common';
import { normalizeCustomerPhone } from '@modules/customers/domain/customer-phone';
import {
  RENTAL_ORDER_READER,
  type RentalOrderReader,
} from '../domain/ports/rental-order-reader.port';
import type { WebOrderLookupInput, WebOrderLookupResult } from './web-rental.contracts';
import { RentalNotFoundError } from './rental.errors';

@Injectable()
export class WebRentalLookupService {
  constructor(@Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader) {}

  async lookupOrder(shopId: string, req: WebOrderLookupInput): Promise<WebOrderLookupResult> {
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeCustomerPhone(req.phone);
    } catch {
      throw new RentalNotFoundError('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const order = await this.orderReader.lookupStorefrontOrder(shopId, req.orderCode);

    if (!order || order.customerNormalizedPhone !== normalizedPhone) {
      throw new RentalNotFoundError('Không tìm thấy đơn thuê với thông tin đã cung cấp.');
    }

    const rawPhone = order.customerPhone;
    const maskedPhone =
      rawPhone.length >= 7 ? `${rawPhone.slice(0, 3)}****${rawPhone.slice(-3)}` : rawPhone;

    return {
      orderCode: order.orderNumber,
      customerName: order.customerFullName,
      phoneMasked: maskedPhone,
      pickupDate: order.rentalStartAt.toISOString().slice(0, 10),
      returnDate: order.rentalEndAt.toISOString().slice(0, 10),
      status: order.status,
      totalAmount: order.grandTotal,
      depositAmount: order.depositRequired,
      paidAmount: order.paidAmount,
      items: order.items,
    };
  }
}
