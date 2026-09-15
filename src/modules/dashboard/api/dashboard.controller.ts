import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { DashboardService } from '../application/dashboard.service';
import { DashboardSummaryResDto } from './dashboard.dto';

@ApiSurface('admin')
@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: 'Shop dashboard revenue, rental KPIs and bounded operational lists' })
  @ApiOkResponse({ type: DashboardSummaryResDto })
  summary(@CurrentUser() user: CurrentUserType): Promise<DashboardSummaryResDto> {
    return this.service.summary(user);
  }
}
