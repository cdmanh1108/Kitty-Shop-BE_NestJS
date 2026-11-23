import { Logger, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@database/prisma/prisma.service';
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
      await this.coordinator.runIfOwner('payos-rental-reconciliation', (lease) =>
        this.service.syncDue(() => lease.assertActive()),
      );
    } catch {
      this.logger.warn('Tác vụ đối soát payOS sẽ thử lại ở lượt tiếp theo.');
    }
  }
}
