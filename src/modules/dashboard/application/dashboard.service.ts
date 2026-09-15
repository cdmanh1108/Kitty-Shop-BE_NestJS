import { CLOCK, type Clock } from '@common/clock/clock';
import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@common/types/current-user';
import { zonedDayRange, zonedMonthRange } from '@common/utils/timezone';
import { DASHBOARD_REPOSITORY, type DashboardRepository } from '../domain/dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DASHBOARD_REPOSITORY) private readonly repository: DashboardRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(user: CurrentUser) {
    const now = this.clock.now();
    const timezone = await this.repository.getShopTimezone(user.shopId);
    const day = zonedDayRange(now, timezone);
    const month = zonedMonthRange(now, timezone);
    let seriesStart = day.start;
    for (let index = 0; index < 6; index++) {
      seriesStart = zonedDayRange(new Date(seriesStart.getTime() - 1), timezone).start;
    }
    return this.repository.summary({
      shopId: user.shopId,
      now,
      dayStart: day.start,
      dayEnd: day.end,
      monthStart: month.start,
      monthEnd: month.end,
      timezone,
      seriesStart,
      dueSoonEnd: zonedDayRange(day.end, timezone).end,
    });
  }
}
