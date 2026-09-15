import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@common/clock/clock';
import { localMidnightUtc, zonedDayRange, zonedMonthRange } from '@common/utils/timezone';
import type { CurrentUser } from '@common/types/current-user';
import {
  FINANCE_READ_REPOSITORY,
  type FinanceReadRepository,
  type FinanceFilter,
  type FinanceCriteria,
} from '../domain/finance-read.repository';

export function resolveFinancePeriod(filter: FinanceFilter, now: Date, timezone: string) {
  const key = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException('Ngày phải có định dạng YYYY-MM-DD.');
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new BadRequestException('Ngày không hợp lệ.');
    return date;
  };
  const midnight = (date: Date) =>
    localMidnightUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), timezone);
  let range = zonedMonthRange(now, timezone);
  const preset = filter.preset ?? 'month';
  if (preset !== 'custom' && (filter.from || filter.to))
    throw new BadRequestException('Chỉ nhập từ ngày/đến ngày khi chọn khoảng tùy chọn.');
  if (preset === 'today') range = zonedDayRange(now, timezone);
  if (preset === 'week') {
    const monday = parse(key(now));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const next = new Date(monday);
    next.setUTCDate(next.getUTCDate() + 7);
    range = { start: midnight(monday), end: midnight(next) };
  }
  if (preset === 'custom') {
    if (!filter.from || !filter.to)
      throw new BadRequestException('Vui lòng chọn đủ ngày bắt đầu và kết thúc.');
    const from = parse(filter.from);
    const to = parse(filter.to);
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days < 0 || days > 365)
      throw new BadRequestException('Khoảng ngày phải đúng thứ tự và không vượt quá 366 ngày.');
    to.setUTCDate(to.getUTCDate() + 1);
    range = { start: midnight(from), end: midnight(to) };
  }
  return {
    ...range,
    period: { from: key(range.start), to: key(new Date(range.end.getTime() - 1)), timezone },
  };
}

@Injectable()
export class FinanceReadService {
  constructor(
    @Inject(FINANCE_READ_REPOSITORY) private readonly repository: FinanceReadRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  private async criteria(user: CurrentUser, filter: FinanceFilter): Promise<FinanceCriteria> {
    const now = this.clock.now();
    const timezone = await this.repository.timezone(user.shopId);
    return {
      shopId: user.shopId,
      ...resolveFinancePeriod(filter, now, timezone),
      direction: filter.direction,
      category: filter.category,
    };
  }
  async summary(user: CurrentUser, filter: FinanceFilter) {
    const input = await this.criteria(user, filter);
    return { period: input.period, ...(await this.repository.summary(input)) };
  }
  async transactions(
    user: CurrentUser,
    filter: FinanceFilter & { page: number; limit: number; sort: 'newest' | 'oldest' },
  ) {
    return this.repository.transactions({
      ...(await this.criteria(user, filter)),
      page: filter.page,
      limit: filter.limit,
      sort: filter.sort,
    });
  }
}
