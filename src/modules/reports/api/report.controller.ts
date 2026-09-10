import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { ReportService } from '../application/report.service';
import { CustomerPerformanceResDto, PerformanceQueryDto, ProductPerformanceResDto, ReportRangeQueryDto, RevenueReportRowResDto } from './report.dto';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  @Get('revenue')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Daily realized revenue, expense and profit; deposits are excluded from revenue' })
  @ApiOkResponse({ type: [RevenueReportRowResDto] })
  revenue(@CurrentUser() user: CurrentUserType, @Query() query: ReportRangeQueryDto) { return this.service.revenue(user, query); }

  @Get('products')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Most/least rented product performance from completed orders' })
  @ApiOkResponse({ type: [ProductPerformanceResDto] })
  products(@CurrentUser() user: CurrentUserType, @Query() query: PerformanceQueryDto) { return this.service.productPerformance(user, query); }

  @Get('customers')
  @Permissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOkResponse({ type: [CustomerPerformanceResDto] })
  customerPerformance(@CurrentUser() user: CurrentUserType, @Query() query: PerformanceQueryDto) { return this.service.customerPerformance(user, query); }
}
