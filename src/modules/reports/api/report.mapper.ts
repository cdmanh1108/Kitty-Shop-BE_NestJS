import type { PerformanceQuery, ReportRangeQuery } from '../application/report.contracts';
import type { PerformanceQueryDto, ReportRangeQueryDto } from './report.dto';

export function toPerformanceQuery(dto: PerformanceQueryDto): PerformanceQuery {
  return { ...dto };
}
export function toReportRangeQuery(dto: ReportRangeQueryDto): ReportRangeQuery {
  return { ...dto };
}
