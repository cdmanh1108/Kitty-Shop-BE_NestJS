import { ClockModule } from '@common/clock/clock.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { WebAuthModule } from '@modules/web-auth/web-auth.module';
import { Module } from '@nestjs/common';
import { AdminRentalController } from './api/admin/admin-rental.controller';
import { WebAccountRentalOrdersController } from './api/web/web-account-rental-orders.controller';
import { WebRentalController } from './api/web/web-rental.controller';
import { RentalService } from './application/rental.service';
import { WebRentalService } from './application/web-rental.service';
import { WebAccountRentalOrdersService } from './application/web-account-rental-orders.service';
import { RentalConfirmationService } from './application/rental-confirmation.service';
import { RentalSettlementService } from './application/rental-settlement.service';
import { RentalReadPresenter } from './application/rental-read.presenter';
import { RENTAL_REPOSITORY } from './domain/rental.repository';
import { PrismaRentalRepository } from './infrastructure/prisma-rental.repository';

@Module({
  imports: [ClockModule, SettingsModule, CustomersModule, WebAuthModule],
  controllers: [AdminRentalController, WebRentalController, WebAccountRentalOrdersController],
  providers: [
    RentalConfirmationService,
    RentalSettlementService,
    RentalReadPresenter,
    RentalService,
    WebRentalService,
    WebAccountRentalOrdersService,
    PrismaRentalRepository,
    { provide: RENTAL_REPOSITORY, useExisting: PrismaRentalRepository },
  ],
  exports: [RentalService, WebRentalService, RentalSettlementService],
})
export class RentalsModule {}
