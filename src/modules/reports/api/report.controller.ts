import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportService } from '../application/report.service';
import {
  CustomerPerformanceResDto,
  PerformanceQueryDto,
  ProductPerformanceResDto,
  ReportRangeQueryDto,
  RevenueReportRowResDto,
} from './report.dto';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { toPerformanceQuery, toReportRangeQuery } from './report.mapper';

@ApiSurface('admin')
@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('admin/reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  @Get('revenue')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({
    summary: 'Daily realized revenue, expense and profit; deposits are excluded from revenue',
  })
  @ApiOkResponse({ type: [RevenueReportRowResDto] })
  revenue(@CurrentUser() user: CurrentUserType, @Query() query: ReportRangeQueryDto) {
    return this.service.revenue(user, toReportRangeQuery(query));
  }

  @Get('products')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Most/least rented product performance from completed orders' })
  @ApiOkResponse({ type: [ProductPerformanceResDto] })
  products(@CurrentUser() user: CurrentUserType, @Query() query: PerformanceQueryDto) {
    return this.service.productPerformance(user, toPerformanceQuery(query));
  }

  @Get('customers')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOkResponse({ type: [CustomerPerformanceResDto] })
  customerPerformance(@CurrentUser() user: CurrentUserType, @Query() query: PerformanceQueryDto) {
    return this.service.customerPerformance(user, toPerformanceQuery(query));
  }
}
