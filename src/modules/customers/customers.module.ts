import { Module } from '@nestjs/common';
import { CustomerController } from './api/customer.controller';
import { CustomerService } from './application/customer.service';
import { CUSTOMER_REPOSITORY } from './domain/customer.repository';
import { PrismaCustomerRepository } from './infrastructure/prisma-customer.repository';

@Module({
  controllers: [CustomerController],
  providers: [
    CustomerService,
    PrismaCustomerRepository,
    { provide: CUSTOMER_REPOSITORY, useExisting: PrismaCustomerRepository },
  ],
  exports: [CustomerService, CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
