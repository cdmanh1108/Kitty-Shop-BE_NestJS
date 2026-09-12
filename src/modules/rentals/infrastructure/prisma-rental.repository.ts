import { CLOCK, type Clock } from '@common/clock/clock';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/domain/rental-policy';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable, Inject } from '@nestjs/common';
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
import { createOrder } from './rental-booking';
import { claimIdempotency, releaseIdempotency } from './rental-idempotency';
import { transition, reschedule, addCharge, setDocumentCollateral } from './rental-lifecycle';

@Injectable()
export class PrismaRentalRepository implements RentalRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policies: RentalPolicyProvider,
  ) {}

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

  async createOrder(
    ...args: Parameters<RentalRepository['createOrder']>
  ): ReturnType<RentalRepository['createOrder']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return createOrder(this.prisma, args[0], policy);
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

  async transition(
    ...args: Parameters<RentalRepository['transition']>
  ): ReturnType<RentalRepository['transition']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return transition(this.prisma, args[0], policy, this.clock);
  }

  async reschedule(
    ...args: Parameters<RentalRepository['reschedule']>
  ): ReturnType<RentalRepository['reschedule']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return reschedule(this.prisma, args[0], policy);
  }

  addCharge(
    ...args: Parameters<RentalRepository['addCharge']>
  ): ReturnType<RentalRepository['addCharge']> {
    return addCharge(this.prisma, ...args);
  }

  receiveCollateral(shopId: string, orderId: string, changedBy: string) {
    return setDocumentCollateral(this.prisma, shopId, orderId, changedBy, 'RECEIVE', this.clock);
  }

  returnCollateral(shopId: string, orderId: string, changedBy: string) {
    return setDocumentCollateral(this.prisma, shopId, orderId, changedBy, 'RETURN', this.clock);
  }

  claimIdempotency(
    ...args: Parameters<RentalRepository['claimIdempotency']>
  ): ReturnType<RentalRepository['claimIdempotency']> {
    return claimIdempotency(this.prisma, this.clock, ...args);
  }

  releaseIdempotency(
    ...args: Parameters<RentalRepository['releaseIdempotency']>
  ): ReturnType<RentalRepository['releaseIdempotency']> {
    return releaseIdempotency(this.prisma, ...args);
  }
}
