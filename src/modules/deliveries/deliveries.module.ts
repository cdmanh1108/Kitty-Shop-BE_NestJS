import { Module } from '@nestjs/common';
import { DeliveryController } from './api/delivery.controller';
import { DeliveryService } from './application/delivery.service';
import { DELIVERY_REPOSITORY } from './domain/delivery.repository';
import { PrismaDeliveryRepository } from './infrastructure/prisma-delivery.repository';

@Module({
  controllers: [DeliveryController],
  providers: [
    DeliveryService,
    PrismaDeliveryRepository,
    { provide: DELIVERY_REPOSITORY, useExisting: PrismaDeliveryRepository },
  ],
})
export class DeliveriesModule {}
