import { Module } from '@nestjs/common';
import { FinanceController } from './api/finance.controller';
import { FinanceService } from './application/finance.service';
import { FINANCE_REPOSITORY } from './domain/finance.repository';
import { PrismaFinanceRepository } from './infrastructure/prisma-finance.repository';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, PrismaFinanceRepository, { provide: FINANCE_REPOSITORY, useExisting: PrismaFinanceRepository }],
  exports: [FinanceService],
})
export class FinanceModule {}
