import type { CurrentUser } from '@common/types/current-user';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/report.repository';
import type { PerformanceQuery, ReportRangeQuery } from './report.contracts';

@Injectable()
export class ReportService {
  constructor(@Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository) {}

  async revenue(user: CurrentUser, query: ReportRangeQuery) {
    const range = this.range(query);
    const timezone = await this.repository.shopTimezone(user.shopId);
    return this.repository.revenue({ shopId: user.shopId, ...range, timezone });
  }

  productPerformance(user: CurrentUser, query: PerformanceQuery) {
    return this.repository.productPerformance({
      shopId: user.shopId,
      ...this.range(query),
      limit: query.limit,
    });
  }

  customerPerformance(user: CurrentUser, query: PerformanceQuery) {
    return this.repository.customerPerformance({
      shopId: user.shopId,
      ...this.range(query),
      limit: query.limit,
    });
  }

  private range(query: ReportRangeQuery): { from: Date; until: Date } {
    const until = query.until ? new Date(query.until) : new Date();
    const from = query.from ? new Date(query.from) : new Date(until.getTime() - 30 * 86_400_000);
    if (from >= until) throw new BadRequestException('from must be earlier than until');
    if (until.getTime() - from.getTime() > 2 * 365 * 86_400_000) {
      throw new BadRequestException('Report range cannot exceed 2 years');
    }
    return { from, until };
  }
}
