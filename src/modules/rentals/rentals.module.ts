import { ClockModule } from '@common/clock/clock.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { WebAuthModule } from '@modules/web-auth/web-auth.module';
import { Module } from '@nestjs/common';
import { AdminRentalController } from './api/admin/admin-rental.controller';
import { WebAccountRentalOrdersController } from './api/web/web-account-rental-orders.controller';
import { WebRentalController } from './api/web/web-rental.controller';
import { RentalCreationService } from './application/rental-creation.service';
import { RentalLifecycleService } from './application/rental-lifecycle.service';
import { RentalReadService } from './application/rental-read.service';
import { RentalReturnService } from './application/rental-return.service';
import { WebRentalEvaluationService } from './application/web-rental-evaluation.service';
import { WebRentalOrderService } from './application/web-rental-order.service';
import { WebRentalLookupService } from './application/web-rental-lookup.service';
import { WebAccountRentalOrdersService } from './application/web-account-rental-orders.service';
import { RentalConfirmationService } from './application/rental-confirmation.service';
import { RentalSettlementService } from './application/rental-settlement.service';
import { RentalReadPresenter } from './application/rental-read.presenter';
import { RENTAL_AVAILABILITY_READER } from './domain/ports/rental-availability.port';
import { RENTAL_AVAILABLE_INVENTORY_READER } from './public/available-inventory-reader';
import {
  RENTAL_CREATION_VALIDATOR,
  RENTAL_CREATION_REPOSITORY,
} from './domain/ports/rental-creation.port';
import { RENTAL_LIFECYCLE_REPOSITORY } from './domain/ports/rental-lifecycle.port';
import { RENTAL_ORDER_READER } from './domain/ports/rental-order-reader.port';
import { WEB_ACCOUNT_RENTAL_ORDERS_READER } from './domain/ports/web-account-rental-orders.reader';
import { PrismaRentalRepository } from './infrastructure/prisma-rental.repository';
import { RENTAL_SETTLEMENT_PREVIEW_READER } from './domain/ports/rental-settlement-preview.port';
import { RENTAL_EMAIL_QUEUE, RENTAL_EMAIL_SENDER } from './domain/rental-email';
import { RentalEmailService } from './application/rental-email.service';
import { PrismaRentalEmailQueue } from './infrastructure/prisma-rental-email.queue';
import { ResendRentalEmailSender } from './infrastructure/resend-rental-email.sender';
import { RentalEmailJob } from './infrastructure/jobs/rental-email.job';

@Module({
  imports: [ClockModule, SettingsModule, CustomersModule, WebAuthModule],
  controllers: [AdminRentalController, WebRentalController, WebAccountRentalOrdersController],
  providers: [
    RentalEmailService,
    RentalEmailJob,
    { provide: RENTAL_EMAIL_QUEUE, useClass: PrismaRentalEmailQueue },
    { provide: RENTAL_EMAIL_SENDER, useClass: ResendRentalEmailSender },
    RentalConfirmationService,
    RentalSettlementService,
    RentalReadPresenter,
    RentalCreationService,
    RentalLifecycleService,
    RentalReadService,
    RentalReturnService,
    WebRentalEvaluationService,
    WebRentalOrderService,
    WebRentalLookupService,
    WebAccountRentalOrdersService,
    PrismaRentalRepository,
    { provide: RENTAL_AVAILABILITY_READER, useExisting: PrismaRentalRepository },
    { provide: RENTAL_AVAILABLE_INVENTORY_READER, useExisting: PrismaRentalRepository },
    { provide: RENTAL_CREATION_VALIDATOR, useExisting: PrismaRentalRepository },
    { provide: RENTAL_CREATION_REPOSITORY, useExisting: PrismaRentalRepository },
    { provide: RENTAL_ORDER_READER, useExisting: PrismaRentalRepository },
    { provide: RENTAL_SETTLEMENT_PREVIEW_READER, useExisting: PrismaRentalRepository },
    { provide: RENTAL_LIFECYCLE_REPOSITORY, useExisting: PrismaRentalRepository },
    { provide: WEB_ACCOUNT_RENTAL_ORDERS_READER, useExisting: PrismaRentalRepository },
  ],
  exports: [RENTAL_AVAILABILITY_READER, RENTAL_AVAILABLE_INVENTORY_READER],
})
export class RentalsModule {}
