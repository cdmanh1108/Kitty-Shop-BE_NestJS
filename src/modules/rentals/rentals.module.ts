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
import {
  RENTAL_AVAILABILITY_READER,
  RENTAL_CREATION_VALIDATOR,
  RENTAL_CREATION_REPOSITORY,
  RENTAL_LIFECYCLE_REPOSITORY,
  RENTAL_ORDER_READER,
  WEB_ACCOUNT_RENTAL_ORDERS_READER,
} from './domain/rental.repository';
import { PrismaRentalRepository } from './infrastructure/prisma-rental.repository';

@Module({
  imports: [ClockModule, SettingsModule, CustomersModule, WebAuthModule],
  controllers: [AdminRentalController, WebRentalController, WebAccountRentalOrdersController],
  providers: [
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
    { provide: RENTAL_CREATION_VALIDATOR, useExisting: PrismaRentalRepository },
    { provide: RENTAL_CREATION_REPOSITORY, useExisting: PrismaRentalRepository },
    { provide: RENTAL_ORDER_READER, useExisting: PrismaRentalRepository },
    { provide: RENTAL_LIFECYCLE_REPOSITORY, useExisting: PrismaRentalRepository },
    { provide: WEB_ACCOUNT_RENTAL_ORDERS_READER, useExisting: PrismaRentalRepository },
  ],
})
export class RentalsModule {}
