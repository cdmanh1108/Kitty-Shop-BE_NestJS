import { ClockModule } from '@common/clock/clock.module';
import { SettingsModule } from '@modules/settings/settings.module';
import { Module } from '@nestjs/common';
import { RentalController } from './api/rental.controller';
import { RentalService } from './application/rental.service';
import { RentalConfirmationService } from './application/rental-confirmation.service';
import { RentalSettlementService } from './application/rental-settlement.service';
import { RENTAL_REPOSITORY } from './domain/rental.repository';
import { PrismaRentalRepository } from './infrastructure/prisma-rental.repository';

@Module({
  imports: [ClockModule, SettingsModule],
  controllers: [RentalController],
  providers: [
    RentalConfirmationService,
    RentalSettlementService,
    RentalService,
    PrismaRentalRepository,
    { provide: RENTAL_REPOSITORY, useExisting: PrismaRentalRepository },
  ],
  exports: [RentalService, RentalSettlementService],
})
export class RentalsModule {}
