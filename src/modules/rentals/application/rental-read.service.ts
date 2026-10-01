import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import { RENTAL_ORDER_READER, type RentalOrderReader } from '../domain/rental.repository';
import type { RentalListQuery } from './rental.contracts';
import { RentalNotFoundError } from './rental.errors';

@Injectable()
export class RentalReadService {
  constructor(@Inject(RENTAL_ORDER_READER) private readonly orderReader: RentalOrderReader) {}

  list(user: CurrentUser, query: RentalListQuery) {
    if (query.from && query.until) {
      calculateRentalDurationDays(new Date(query.from), new Date(query.until));
    }
    return this.orderReader.list({
      shopId: user.shopId,
      page: query.page,
      customerId: query.customerId,
      limit: query.limit,
      search: query.search,
      status: query.status,
      paymentStatus: query.paymentStatus,
      from: query.from ? new Date(query.from) : undefined,
      until: query.until ? new Date(query.until) : undefined,
    });
  }

  async get(user: CurrentUser, id: string) {
    const order = await this.orderReader.get(user.shopId, id);
    if (!order) throw new RentalNotFoundError('Không tìm thấy đơn thuê.');
    return order;
  }
}
