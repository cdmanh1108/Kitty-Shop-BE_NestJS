import { Module } from '@nestjs/common';
import { DashboardController } from './api/dashboard.controller';
import { DashboardService } from './application/dashboard.service';
import { DASHBOARD_REPOSITORY } from './domain/dashboard.repository';
import { PrismaDashboardRepository } from './infrastructure/prisma-dashboard.repository';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PrismaDashboardRepository, { provide: DASHBOARD_REPOSITORY, useExisting: PrismaDashboardRepository }],
})
export class DashboardModule {}
