import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { ClockModule } from '@common/clock/clock.module';
import { PayosWebhookController } from './api/payos-webhook.controller';
import { PaymentService } from './application/payment.service';
import { PAYMENT_GATEWAY } from './domain/payment';
import { PAYMENT_REPOSITORY, type PaymentRepository } from './domain/payment.repository';
import { PaymentReconciliationJob } from './infrastructure/jobs/payment-reconciliation.job';
import { PayosAdapter } from './infrastructure/payos.adapter';

@Module({
  providers: [PayosAdapter, { provide: PAYMENT_GATEWAY, useExisting: PayosAdapter }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {
  static register(repository: Type<PaymentRepository>): DynamicModule {
    return {
      module: PaymentsModule,
      imports: [ClockModule],
      controllers: [PayosWebhookController],
      providers: [
        { provide: PAYMENT_REPOSITORY, useClass: repository },
        PaymentService,
        PaymentReconciliationJob,
      ],
      exports: [PaymentService],
    };
  }
}
