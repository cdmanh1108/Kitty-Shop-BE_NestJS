import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import { canRescheduleRental } from '@modules/rentals/domain/rental-policy';
import { ORDER_PAYMENT_STATUS, DEPOSIT_STATUS } from '@modules/finance/domain/payment-status';
import { CLOCK, type Clock } from '@common/clock/clock';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { CurrentUser } from '@common/types/current-user';
import { zonedDateKey, zonedDayRange } from '@common/utils/timezone';
import {
  REMINDER_REPOSITORY,
  type ReminderOrderCandidate,
  type ReminderRepository,
} from '../domain/reminder.repository';

/** Bounds query materialization and sequential reminder writes for one shop refresh page. */
export const REMINDER_CANDIDATE_BATCH_SIZE = 100;

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @Inject(REMINDER_REPOSITORY) private readonly repository: ReminderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron('0 */10 * * * *')
  async refreshAll(): Promise<void> {
    const shops = await this.repository.activeShops();
    for (const shop of shops) {
      try {
        await this.refreshShop(shop.id, shop.timezone);
      } catch (error) {
        this.logger.error({
          event: 'reminders.refresh.failed',
          shopId: shop.id,
          error: error instanceof Error ? error : new Error('Lỗi không xác định.'),
        });
      }
    }
  }

  async refreshForUser(user: CurrentUser): Promise<{ refreshed: true }> {
    const shop = (await this.repository.activeShops()).find((item) => item.id === user.shopId);
    await this.refreshShop(user.shopId, shop?.timezone ?? 'Asia/Ho_Chi_Minh');
    return { refreshed: true };
  }

  list(user: CurrentUser, status?: string) {
    return this.repository.list(user.shopId, status);
  }

  async dismiss(user: CurrentUser, id: string) {
    const reminder = await this.repository.dismiss(user.shopId, id, user.memberId);
    if (!reminder) throw new NotFoundException('Không tìm thấy lời nhắc.');
    return reminder;
  }

  private async refreshShop(shopId: string, timezone: string): Promise<void> {
    const startedAt = Date.now();
    const now = this.clock.now();
    const day = zonedDayRange(now, timezone);
    const dayKey = zonedDateKey(now, timezone);
    const returnSoonEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const activeKeys = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    let candidateOrders = 0;
    let reminderUpserts = 0;

    const add = async (
      order: ReminderOrderCandidate,
      type: string,
      priority: number,
      title: string,
      content: string,
      scheduledFor: Date,
    ) => {
      const key = `${type}:${order.id}:${dayKey}`;
      activeKeys.add(key);
      reminderUpserts += 1;
      await this.repository.upsert({
        shopId,
        orderId: order.id,
        customerId: order.customerId,
        dedupeKey: key,
        type,
        scheduledFor,
        priority,
        title,
        content,
      });
    };

    do {
      const page = await this.repository.candidatePage({
        shopId,
        now,
        dayStart: day.start,
        dayEnd: day.end,
        returnSoonEnd,
        cursor,
        limit: REMINDER_CANDIDATE_BATCH_SIZE,
      });
      pages += 1;
      candidateOrders += page.items.length;
      for (const order of page.items) {
        if (
          canRescheduleRental(order.status) &&
          order.rentalStartAt >= day.start &&
          order.rentalStartAt < day.end
        ) {
          await add(
            order,
            'PICKUP_TODAY',
            50,
            `Nhận đồ hôm nay · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            order.rentalStartAt,
          );
        }
        if (
          (order.status === RENTAL_STATUS.CONFIRMED || order.status === RENTAL_STATUS.ACTIVE) &&
          order.rentalEndAt >= day.start &&
          order.rentalEndAt < day.end
        ) {
          await add(
            order,
            'RETURN_TODAY',
            60,
            `Trả đồ hôm nay · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            order.rentalEndAt,
          );
        } else if (
          (order.status === RENTAL_STATUS.CONFIRMED || order.status === RENTAL_STATUS.ACTIVE) &&
          order.rentalEndAt > now &&
          order.rentalEndAt <= returnSoonEnd
        ) {
          await add(
            order,
            'RETURN_SOON',
            40,
            `Sắp tới hạn trả · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            order.rentalEndAt,
          );
        }
        if (
          (order.status === RENTAL_STATUS.CONFIRMED || order.status === RENTAL_STATUS.ACTIVE) &&
          order.rentalEndAt < now
        ) {
          await add(
            order,
            'OVERDUE',
            100,
            `Quá hạn · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            now,
          );
        }
        if (
          order.paymentStatus !== ORDER_PAYMENT_STATUS.PAID &&
          order.status !== RENTAL_STATUS.CANCELLED
        ) {
          await add(
            order,
            'PAYMENT_DUE',
            70,
            `Còn thiếu tiền · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            now,
          );
        }
        if (
          order.depositRequired > 0 &&
          (order.depositStatus === DEPOSIT_STATUS.PENDING ||
            order.depositStatus === DEPOSIT_STATUS.PARTIALLY_HELD) &&
          canRescheduleRental(order.status)
        ) {
          await add(
            order,
            'DEPOSIT_DUE',
            80,
            `Chưa đủ cọc · ${order.orderNumber}`,
            `${order.customerName} · ${order.customerPhone}`,
            now,
          );
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    const resolvedCount = await this.repository.resolveMissing(shopId, [...activeKeys]);
    this.logger.log({
      event: 'reminders.refresh.completed',
      shopId,
      durationMs: Date.now() - startedAt,
      pages,
      candidateOrders,
      reminderUpserts,
      activeReminderKeys: activeKeys.size,
      resolvedCount,
      batchSize: REMINDER_CANDIDATE_BATCH_SIZE,
    });
  }
}
