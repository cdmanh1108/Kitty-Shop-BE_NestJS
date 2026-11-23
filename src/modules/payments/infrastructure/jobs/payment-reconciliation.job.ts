import { Logger, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@database/prisma/prisma.service';
import { safeErrorDiagnostic } from '@common/logging/safe-error-diagnostic';
import { PrismaSchedulerJobLeaseCoordinator } from '@common/scheduling/prisma-scheduler-job-lease.coordinator';
import { PaymentService } from '../../application/payment.service';

@Injectable()
export class PaymentReconciliationJob {
  private readonly coordinator: PrismaSchedulerJobLeaseCoordinator;
  private readonly logger = new Logger(PaymentReconciliationJob.name);

  constructor(
    prisma: PrismaService,
    private readonly service: PaymentService,
  ) {
    this.coordinator = new PrismaSchedulerJobLeaseCoordinator(prisma, 60_000);
  }

  @Cron('15 * * * * *')
  async execute() {
    if (!this.service.isConfigured()) return;
    try {
      await this.coordinator.runIfOwner('payos-rental-reconciliation', async (lease) => {
        const overdueAttempts = await this.service.syncDue(() => lease.assertActive());
        if (overdueAttempts > 0)
          this.logger.warn({ event: 'payment.reconciliation_overdue', overdueAttempts });
      });
    } catch (error) {
      this.logger.warn({
        event: 'payment.reconciliation_failed',
        diagnostic: safeErrorDiagnostic(error),
      });
    }
  }
}
