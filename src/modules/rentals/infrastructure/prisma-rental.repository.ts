import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { RentalRepository } from '../domain/rental.repository';
import {
  customerExists,
  locationExists,
  list,
  get,
  getStatus,
  getSchedule,
} from './rental-queries';
import { getBookableVariant } from './rental-availability';
import { createOrder, claimIdempotency, releaseIdempotency } from './rental-booking';
import { transition, reschedule, addCharge } from './rental-lifecycle';

@Injectable()
export class PrismaRentalRepository implements RentalRepository {
  constructor(private readonly prisma: PrismaService) {}

  customerExists(
    ...args: Parameters<RentalRepository['customerExists']>
  ): ReturnType<RentalRepository['customerExists']> {
    return customerExists(this.prisma, ...args);
  }

  locationExists(
    ...args: Parameters<RentalRepository['locationExists']>
  ): ReturnType<RentalRepository['locationExists']> {
    return locationExists(this.prisma, ...args);
  }

  getBookableVariant(
    ...args: Parameters<RentalRepository['getBookableVariant']>
  ): ReturnType<RentalRepository['getBookableVariant']> {
    return getBookableVariant(this.prisma, ...args);
  }

  createOrder(
    ...args: Parameters<RentalRepository['createOrder']>
  ): ReturnType<RentalRepository['createOrder']> {
    return createOrder(this.prisma, ...args);
  }

  list(...args: Parameters<RentalRepository['list']>): ReturnType<RentalRepository['list']> {
    return list(this.prisma, ...args);
  }

  get(...args: Parameters<RentalRepository['get']>): ReturnType<RentalRepository['get']> {
    return get(this.prisma, ...args);
  }

  getStatus(
    ...args: Parameters<RentalRepository['getStatus']>
  ): ReturnType<RentalRepository['getStatus']> {
    return getStatus(this.prisma, ...args);
  }

  getSchedule(
    ...args: Parameters<RentalRepository['getSchedule']>
  ): ReturnType<RentalRepository['getSchedule']> {
    return getSchedule(this.prisma, ...args);
  }

  transition(
    ...args: Parameters<RentalRepository['transition']>
  ): ReturnType<RentalRepository['transition']> {
    return transition(this.prisma, ...args);
  }

  reschedule(
    ...args: Parameters<RentalRepository['reschedule']>
  ): ReturnType<RentalRepository['reschedule']> {
    return reschedule(this.prisma, ...args);
  }

  addCharge(
    ...args: Parameters<RentalRepository['addCharge']>
  ): ReturnType<RentalRepository['addCharge']> {
    return addCharge(this.prisma, ...args);
  }

  claimIdempotency(
    ...args: Parameters<RentalRepository['claimIdempotency']>
  ): ReturnType<RentalRepository['claimIdempotency']> {
    return claimIdempotency(this.prisma, ...args);
  }

  releaseIdempotency(
    ...args: Parameters<RentalRepository['releaseIdempotency']>
  ): ReturnType<RentalRepository['releaseIdempotency']> {
    return releaseIdempotency(this.prisma, ...args);
  }
}
