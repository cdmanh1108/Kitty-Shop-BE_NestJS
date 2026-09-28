import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RENTAL_REPOSITORY,
  type RentalRepository,
  type WebAccountRentalOrderDetail,
  type WebAccountRentalOrderPage,
} from '../domain/rental.repository';
import type { WebAccountRentalOrdersQuery } from './web-account-rental-orders.contracts';

@Injectable()
export class WebAccountRentalOrdersService {
  constructor(@Inject(RENTAL_REPOSITORY) private readonly rentals: RentalRepository) {}

  list(
    webAccountId: string,
    query: WebAccountRentalOrdersQuery,
  ): Promise<WebAccountRentalOrderPage> {
    return this.rentals.listWebAccountOrders({ webAccountId, ...query });
  }

  async get(webAccountId: string, orderCode: string): Promise<WebAccountRentalOrderDetail> {
    const order = await this.rentals.getWebAccountOrder(webAccountId, orderCode);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn thuê.');
    }
    return order;
  }
}
