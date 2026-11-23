import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/payment';
import { PayosAdapter } from './infrastructure/payos.adapter';

@Module({
  providers: [PayosAdapter, { provide: PAYMENT_GATEWAY, useExisting: PayosAdapter }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
