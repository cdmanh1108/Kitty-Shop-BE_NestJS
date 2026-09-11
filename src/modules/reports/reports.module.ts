import { ClockModule } from '@common/clock/clock.module';
import { Module } from '@nestjs/common';
import { ReportController } from './api/report.controller';
import { ReportService } from './application/report.service';
import { REPORT_REPOSITORY } from './domain/report.repository';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository';

@Module({
  imports: [ClockModule],
  controllers: [ReportController],
  providers: [
    ReportService,
    PrismaReportRepository,
    { provide: REPORT_REPOSITORY, useExisting: PrismaReportRepository },
  ],
})
export class ReportsModule {}
