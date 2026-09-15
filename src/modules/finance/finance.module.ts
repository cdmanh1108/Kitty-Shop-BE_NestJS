import { Module } from '@nestjs/common';
import { ClockModule } from '@common/clock/clock.module';
import { FinanceReadController } from './api/finance-read.controller';
import { FinanceReadService } from './application/finance-read.service';
import { FINANCE_READ_REPOSITORY } from './domain/finance-read.repository';
import { PrismaFinanceReadRepository } from './infrastructure/prisma-finance-read.repository';
import { FinanceController } from './api/finance.controller';
import { FinanceService } from './application/finance.service';
import { FINANCE_REPOSITORY } from './domain/finance.repository';
import { PrismaFinanceRepository } from './infrastructure/prisma-finance.repository';

@Module({
  imports: [ClockModule],
  controllers: [FinanceController, FinanceReadController],
  providers: [
    FinanceReadService,
    { provide: FINANCE_READ_REPOSITORY, useClass: PrismaFinanceReadRepository },
    FinanceService,
    PrismaFinanceRepository,
    { provide: FINANCE_REPOSITORY, useExisting: PrismaFinanceRepository },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
