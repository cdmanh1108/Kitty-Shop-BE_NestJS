import { Module } from '@nestjs/common';
import { CustomerController } from './api/customer.controller';
import { CustomerService } from './application/customer.service';
import { CustomerLoyaltyService } from './application/customer-loyalty.service';
import { CUSTOMER_REPOSITORY } from './domain/customer.repository';
import { CUSTOMER_LOYALTY_READER } from './domain/customer-loyalty.reader';
import { BOOKING_CUSTOMER_RESOLVER } from './public/booking-customer';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';
import { PrismaCustomerLoyaltyReader } from './infrastructure/prisma-customer-loyalty.reader';
import { SettingsModule } from '@modules/settings/settings.module';
import { WebAuthModule } from '@modules/web-auth/web-auth.module';
import { WebAccountLoyaltyController } from './api/web-account-loyalty.controller';

@Module({
  imports: [SettingsModule, WebAuthModule],
  controllers: [CustomerController, WebAccountLoyaltyController],
  providers: [
    CustomerService,
    CustomerLoyaltyService,
    PrismaCustomerRepository,
    PrismaCustomerLoyaltyReader,
    { provide: CUSTOMER_REPOSITORY, useExisting: PrismaCustomerRepository },
    { provide: CUSTOMER_LOYALTY_READER, useExisting: PrismaCustomerLoyaltyReader },
    { provide: BOOKING_CUSTOMER_RESOLVER, useExisting: PrismaCustomerRepository },
  ],
  exports: [
    CustomerService,
    CustomerLoyaltyService,
    CUSTOMER_REPOSITORY,
    BOOKING_CUSTOMER_RESOLVER,
  ],
})
export class CustomersModule {}
