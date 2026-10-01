import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import { canRescheduleRental } from '@modules/rentals/domain/rental-policy';
import { ORDER_PAYMENT_STATUS, DEPOSIT_STATUS } from '@modules/finance/domain/payment-status';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import { zonedDateKey, zonedDayRange } from '@common/utils/timezone';
import {
  REMINDER_REPOSITORY,
  type ReminderOrderCandidate,
  type ReminderRepository,
} from '../domain/reminder.repository';
import {
  REMINDER_REFRESH_COORDINATOR,
  type ReminderRefreshCoordinator,
  type ReminderRefreshOwnership,
} from '../domain/reminder-refresh-coordinator';
import { ReminderNotFoundError, ReminderRefreshAlreadyRunningError } from './reminder.errors';

/** Bounds query materialization and sequential reminder writes for one shop refresh page. */
export const REMINDER_CANDIDATE_BATCH_SIZE = 100;

@Injectable()
export class ReminderService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(REMINDER_REPOSITORY) private readonly repository: ReminderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REMINDER_REFRESH_COORDINATOR)
    private readonly refreshCoordinator: ReminderRefreshCoordinator,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(ReminderService.name) ?? silentApplicationLog;
  }

  async refreshAll(): Promise<void> {
    const shops = await this.repository.activeShops();
    for (const shop of shops) {
      try {
        const refreshed = await this.refreshShop(shop.id, shop.timezone);
        if (!refreshed) {
          this.logger.log({
            event: 'reminders.refresh.skipped_busy',
            shopId: shop.id,
            coordinationMode: 'database_lease',
          });
        }
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
    const refreshed = await this.refreshShop(user.shopId, shop?.timezone ?? 'Asia/Ho_Chi_Minh');
    if (!refreshed) {
      throw new ReminderRefreshAlreadyRunningError();
    }
    return { refreshed: true };
  }

  list(user: CurrentUser, status?: string) {
    return this.repository.list(user.shopId, status);
  }

  async dismiss(user: CurrentUser, id: string) {
    const reminder = await this.repository.dismiss(user.shopId, id, user.memberId);
    if (!reminder) throw new ReminderNotFoundError();
    return reminder;
  }

  private async refreshShop(shopId: string, timezone: string): Promise<boolean> {
    const result = await this.refreshCoordinator.runIfOwner(shopId, (ownership) =>
      this.refreshShopOwned(shopId, timezone, ownership),
    );
    return result.acquired;
  }

  private async refreshShopOwned(
    shopId: string,
    timezone: string,
    ownership: ReminderRefreshOwnership,
  ): Promise<void> {
    ownership.assertActive();
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
      ownership.assertActive();
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
      ownership.assertActive();
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

    ownership.assertActive();
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
      coordinationMode: 'database_lease',
      ownerAcquired: true,
    });
  }
}
