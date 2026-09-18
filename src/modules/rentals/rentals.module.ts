import { ClockModule } from '@common/clock/clock.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { Module } from '@nestjs/common';
import { AdminRentalController } from './api/admin/admin-rental.controller';
import { WebRentalController } from './api/web/web-rental.controller';
import { RentalService } from './application/rental.service';
import { WebRentalService } from './application/web-rental.service';
import { RentalConfirmationService } from './application/rental-confirmation.service';
import { RentalSettlementService } from './application/rental-settlement.service';
import { RentalReadPresenter } from './application/rental-read.presenter';
import { RENTAL_REPOSITORY } from './domain/rental.repository';
import { PrismaRentalRepository } from './infrastructure/prisma-rental.repository';

@Module({
  imports: [ClockModule, SettingsModule, CustomersModule],
  controllers: [AdminRentalController, WebRentalController],
  providers: [
    RentalConfirmationService,
    RentalSettlementService,
    RentalReadPresenter,
    RentalService,
    WebRentalService,
    PrismaRentalRepository,
    { provide: RENTAL_REPOSITORY, useExisting: PrismaRentalRepository },
  ],
  exports: [RentalService, WebRentalService, RentalSettlementService],
})
export class RentalsModule {}
