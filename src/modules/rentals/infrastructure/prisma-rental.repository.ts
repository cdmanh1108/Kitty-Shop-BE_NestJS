import { CLOCK, type Clock } from '@common/clock/clock';
import {
  RENTAL_POLICY_PROVIDER,
  type RentalPolicyProvider,
} from '@modules/settings/domain/rental-policy';
import { PrismaService } from '@database/prisma/prisma.service';
import { claimIdempotencyRecord, releaseIdempotencyClaim } from '@database/prisma/idempotency';
import { Injectable, Inject } from '@nestjs/common';
import type {
  RentalAvailabilityReader,
  RentalCreationRepository,
  RentalCreationValidator,
  RentalLifecycleRepository,
  RentalOrderReader,
  WebAccountRentalOrdersReader,
} from '../domain/rental.repository';
import {
  customerExists,
  locationExists,
  list,
  get,
  getStatus,
  getSchedule,
  findActiveVariantIdsByProduct,
  lookupStorefrontOrder,
  listWebAccountOrders,
  getWebAccountOrder,
} from './rental-queries';
import { getBookableVariant } from './rental-availability';
import { createOrder } from './rental-booking';
import { receiveReturn } from './rental-return.lifecycle';
import { settleOrder } from './rental-settlement.lifecycle';
import { transition } from './rental-transition.lifecycle';
import { addCharge, reschedule } from './rental-scheduling.lifecycle';
import { getReturnPreview, returnDocumentCollateral } from './rental-collateral.lifecycle';
import { confirmOrder } from './rental-confirmation';

@Injectable()
export class PrismaRentalRepository
  implements
    RentalAvailabilityReader,
    RentalCreationRepository,
    RentalCreationValidator,
    RentalLifecycleRepository,
    RentalOrderReader,
    WebAccountRentalOrdersReader
{
  async confirm(input: Parameters<RentalLifecycleRepository['confirm']>[0]) {
    return confirmOrder(
      this.prisma,
      input,
      await this.policies.getPolicy(input.shopId),
      this.clock,
    );
  }
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RENTAL_POLICY_PROVIDER) private readonly policies: RentalPolicyProvider,
  ) {}

  customerExists(
    ...args: Parameters<RentalCreationValidator['customerExists']>
  ): ReturnType<RentalCreationValidator['customerExists']> {
    return customerExists(this.prisma, ...args);
  }

  locationExists(
    ...args: Parameters<RentalCreationValidator['locationExists']>
  ): ReturnType<RentalCreationValidator['locationExists']> {
    return locationExists(this.prisma, ...args);
  }

  getBookableVariant(
    ...args: Parameters<RentalAvailabilityReader['getBookableVariant']>
  ): ReturnType<RentalAvailabilityReader['getBookableVariant']> {
    return getBookableVariant(this.prisma, ...args);
  }

  async createOrder(
    ...args: Parameters<RentalCreationRepository['createOrder']>
  ): ReturnType<RentalCreationRepository['createOrder']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return createOrder(this.prisma, args[0], policy);
  }

  list(...args: Parameters<RentalOrderReader['list']>): ReturnType<RentalOrderReader['list']> {
    return list(this.prisma, ...args);
  }

  get(...args: Parameters<RentalOrderReader['get']>): ReturnType<RentalOrderReader['get']> {
    return get(this.prisma, ...args);
  }

  getStatus(
    ...args: Parameters<RentalOrderReader['getStatus']>
  ): ReturnType<RentalOrderReader['getStatus']> {
    return getStatus(this.prisma, ...args);
  }

  getSchedule(
    ...args: Parameters<RentalOrderReader['getSchedule']>
  ): ReturnType<RentalOrderReader['getSchedule']> {
    return getSchedule(this.prisma, ...args);
  }

  async transition(
    ...args: Parameters<RentalLifecycleRepository['transition']>
  ): ReturnType<RentalLifecycleRepository['transition']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return transition(this.prisma, args[0], policy, this.clock);
  }

  async reschedule(
    ...args: Parameters<RentalLifecycleRepository['reschedule']>
  ): ReturnType<RentalLifecycleRepository['reschedule']> {
    const policy = await this.policies.getPolicy(args[0].shopId);
    return reschedule(this.prisma, args[0], policy);
  }

  addCharge(
    ...args: Parameters<RentalLifecycleRepository['addCharge']>
  ): ReturnType<RentalLifecycleRepository['addCharge']> {
    return addCharge(this.prisma, ...args);
  }

  async receiveReturn(input: Parameters<RentalLifecycleRepository['receiveReturn']>[0]) {
    const policy = await this.policies.getPolicy(input.shopId);
    return receiveReturn(this.prisma, input, policy, this.clock);
  }

  async settleOrder(input: Parameters<RentalLifecycleRepository['settleOrder']>[0]) {
    const policy = await this.policies.getPolicy(input.shopId);
    return settleOrder(this.prisma, input, policy, this.clock);
  }

  async getReturnPreview(shopId: string, orderId: string, returnedAt?: Date) {
    const policy = await this.policies.getPolicy(shopId);
    return getReturnPreview(this.prisma, shopId, orderId, returnedAt, policy, this.clock);
  }

  returnCollateral(shopId: string, orderId: string, changedBy: string) {
    return returnDocumentCollateral(this.prisma, shopId, orderId, changedBy, this.clock);
  }

  claimIdempotency(
    ...args: Parameters<RentalCreationRepository['claimIdempotency']>
  ): ReturnType<RentalCreationRepository['claimIdempotency']> {
    return claimIdempotencyRecord(this.prisma, this.clock, ...args);
  }

  releaseIdempotency(
    ...args: Parameters<RentalCreationRepository['releaseIdempotency']>
  ): ReturnType<RentalCreationRepository['releaseIdempotency']> {
    return releaseIdempotencyClaim(this.prisma, ...args);
  }

  findActiveVariantIdsByProduct(
    shopId: string,
    productId: string,
    storefrontEligibility?: boolean,
  ): ReturnType<RentalAvailabilityReader['findActiveVariantIdsByProduct']> {
    return findActiveVariantIdsByProduct(this.prisma, shopId, productId, storefrontEligibility);
  }

  lookupStorefrontOrder(
    shopId: string,
    orderNumber: string,
  ): ReturnType<RentalOrderReader['lookupStorefrontOrder']> {
    return lookupStorefrontOrder(this.prisma, shopId, orderNumber);
  }

  listWebAccountOrders(
    ...args: Parameters<WebAccountRentalOrdersReader['listWebAccountOrders']>
  ): ReturnType<WebAccountRentalOrdersReader['listWebAccountOrders']> {
    return listWebAccountOrders(this.prisma, ...args);
  }

  getWebAccountOrder(
    ...args: Parameters<WebAccountRentalOrdersReader['getWebAccountOrder']>
  ): ReturnType<WebAccountRentalOrdersReader['getWebAccountOrder']> {
    return getWebAccountOrder(this.prisma, ...args);
  }
}
