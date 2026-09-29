import { ShopResolver } from '@common/tenant/shop-resolver';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  RENTAL_REPOSITORY,
  type RentalRepository,
  type WebAccountRentalOrderDetail,
  type WebAccountRentalOrderPage,
} from '../domain/rental.repository';
import { RentalInvariantError } from '../domain/rental-errors';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import { RENTAL_STATUS } from '../domain/rental-status';
import type {
  WebAccountRentalOrderCancellationResult,
  WebAccountRentalOrdersQuery,
} from './web-account-rental-orders.contracts';

const WEB_CANCELLATION_REASON = 'WEB_USER_CANCELLED';
const SELF_CANCELLABLE_DEPOSIT_STATUSES = new Set<string>([
  DEPOSIT_STATUS.PENDING,
  DEPOSIT_STATUS.NOT_REQUIRED,
]);

@Injectable()
export class WebAccountRentalOrdersService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly rentals: RentalRepository,
    private readonly shops: ShopResolver,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async list(
    webAccountId: string,
    query: WebAccountRentalOrdersQuery,
  ): Promise<WebAccountRentalOrderPage> {
    const shopId = await this.shops.resolveShopId();
    return this.rentals.listWebAccountOrders({ shopId, webAccountId, ...query });
  }

  async get(webAccountId: string, orderCode: string): Promise<WebAccountRentalOrderDetail> {
    const shopId = await this.shops.resolveShopId();
    return this.getInShop(shopId, webAccountId, orderCode);
  }

  async cancel(
    webAccountId: string,
    orderCode: string,
  ): Promise<WebAccountRentalOrderCancellationResult> {
    const shopId = await this.shops.resolveShopId();
    const order = await this.getInShop(shopId, webAccountId, orderCode);

    if (order.status !== RENTAL_STATUS.RESERVED) {
      throw new ConflictException({
        code: 'WEB_ORDER_CANNOT_BE_CANCELLED',
        message: 'Đơn thuê không còn ở trạng thái có thể tự hủy.',
      });
    }
    if (
      order.paymentStatus !== ORDER_PAYMENT_STATUS.UNPAID ||
      !SELF_CANCELLABLE_DEPOSIT_STATUSES.has(order.depositStatus)
    ) {
      throw new ConflictException({
        code: 'WEB_ORDER_PAYMENT_PREVENTS_CANCELLATION',
        message: 'Đơn đã có thanh toán hoặc đặt cọc. Vui lòng liên hệ cửa hàng để được hỗ trợ.',
      });
    }

    try {
      const cancelled = await this.rentals.transition({
        shopId,
        orderId: order.id,
        fromStatuses: [RENTAL_STATUS.RESERVED],
        toStatus: RENTAL_STATUS.CANCELLED,
        reason: WEB_CANCELLATION_REASON,
        expectedWebAccountId: webAccountId,
        expectedSource: RENTAL_ORDER_SOURCE.ONLINE,
        expectedPaymentStatus: ORDER_PAYMENT_STATUS.UNPAID,
        requireNoCompletedPayments: true,
      });
      if (!cancelled?.cancelledAt) {
        throw new ConflictException({
          code: 'WEB_ORDER_CANCELLATION_CONFLICT',
          message: 'Đơn thuê vừa được cập nhật. Vui lòng tải lại và thử lại.',
        });
      }
      await this.audit.log({
        shopId,
        actorWebAccountId: webAccountId,
        action: 'WEB_ORDER_CANCELLED',
        entityType: 'rental_order',
        entityId: order.id,
        oldValues: {
          status: RENTAL_STATUS.RESERVED,
          paymentStatus: order.paymentStatus,
          depositStatus: order.depositStatus,
        },
        newValues: {
          status: RENTAL_STATUS.CANCELLED,
          reason: WEB_CANCELLATION_REASON,
          cancelledAt: cancelled.cancelledAt.toISOString(),
        },
      });
      return {
        orderCode: cancelled.orderNumber,
        status: RENTAL_STATUS.CANCELLED,
        cancelledAt: cancelled.cancelledAt,
      };
    } catch (error) {
      if (
        error instanceof RentalInvariantError &&
        error.code === 'WEB_ORDER_PAYMENT_PREVENTS_CANCELLATION'
      ) {
        throw new ConflictException({
          code: error.code,
          message: 'Đơn đã có thanh toán hoặc đặt cọc. Vui lòng liên hệ cửa hàng để được hỗ trợ.',
        });
      }
      throw error;
    }
  }

  private async getInShop(
    shopId: string,
    webAccountId: string,
    orderCode: string,
  ): Promise<WebAccountRentalOrderDetail> {
    const order = await this.rentals.getWebAccountOrder(shopId, webAccountId, orderCode);
    if (!order) throw new NotFoundException('Không tìm thấy đơn thuê.');
    return order;
  }
}
