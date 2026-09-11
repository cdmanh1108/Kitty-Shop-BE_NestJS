import type { CurrentUser } from '@common/types/current-user';
import type { AuditSnapshot } from '@modules/audit/domain/audit.repository';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_RENTAL_POLICY,
  type RentalPolicy,
  type RentalPolicyProvider,
} from '../domain/rental-policy';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/settings.repository';
import type {
  UpdateRentalPolicyInput,
  UpdateShopInput,
  UpsertSettingInput,
} from './settings.contracts';

function buildEffectivePolicy(saved?: RentalPolicy | null): RentalPolicy {
  return {
    rentalPricing: {
      defaultRentalPrice:
        saved?.rentalPricing?.defaultRentalPrice ??
        DEFAULT_RENTAL_POLICY.rentalPricing.defaultRentalPrice,
    },
    deposit: {
      allowedMethods: saved?.deposit?.allowedMethods
        ? [...saved.deposit.allowedMethods]
        : [...DEFAULT_RENTAL_POLICY.deposit.allowedMethods],
      allowedDocumentTypes: saved?.deposit?.allowedDocumentTypes
        ? [...saved.deposit.allowedDocumentTypes]
        : [...DEFAULT_RENTAL_POLICY.deposit.allowedDocumentTypes],
      defaultCashDeposit:
        saved?.deposit?.defaultCashDeposit ?? DEFAULT_RENTAL_POLICY.deposit.defaultCashDeposit,
      categoryOverrides: saved?.deposit?.categoryOverrides
        ? saved.deposit.categoryOverrides.map((item) => ({ ...item }))
        : [...DEFAULT_RENTAL_POLICY.deposit.categoryOverrides],
    },
    reschedule: {
      maxDaysFromBooking:
        saved?.reschedule?.maxDaysFromBooking ??
        DEFAULT_RENTAL_POLICY.reschedule.maxDaysFromBooking,
    },
    lateReturn: {
      feePerItemPerDay:
        saved?.lateReturn?.feePerItemPerDay ?? DEFAULT_RENTAL_POLICY.lateReturn.feePerItemPerDay,
      newRentalChargeFromLateDay:
        saved?.lateReturn?.newRentalChargeFromLateDay ??
        DEFAULT_RENTAL_POLICY.lateReturn.newRentalChargeFromLateDay,
    },
    specialCleaning: {
      feeMin: saved?.specialCleaning?.feeMin ?? DEFAULT_RENTAL_POLICY.specialCleaning.feeMin,
      feeMax: saved?.specialCleaning?.feeMax ?? DEFAULT_RENTAL_POLICY.specialCleaning.feeMax,
    },
    loyalty: {
      enabled: saved?.loyalty?.enabled ?? DEFAULT_RENTAL_POLICY.loyalty.enabled,
      rentalsRequired:
        saved?.loyalty?.rentalsRequired ?? DEFAULT_RENTAL_POLICY.loyalty.rentalsRequired,
      rewardRentalValue:
        saved?.loyalty?.rewardRentalValue ?? DEFAULT_RENTAL_POLICY.loyalty.rewardRentalValue,
      stackableWithPromotions:
        saved?.loyalty?.stackableWithPromotions ??
        DEFAULT_RENTAL_POLICY.loyalty.stackableWithPromotions,
    },
  };
}

function mergePolicyInput(base: RentalPolicy, input: UpdateRentalPolicyInput): RentalPolicy {
  return {
    rentalPricing: {
      defaultRentalPrice:
        input.rentalPricing?.defaultRentalPrice ?? base.rentalPricing.defaultRentalPrice,
    },
    deposit: {
      allowedMethods: input.deposit?.allowedMethods
        ? [...input.deposit.allowedMethods]
        : [...base.deposit.allowedMethods],
      allowedDocumentTypes: input.deposit?.allowedDocumentTypes
        ? [...input.deposit.allowedDocumentTypes]
        : [...base.deposit.allowedDocumentTypes],
      defaultCashDeposit: input.deposit?.defaultCashDeposit ?? base.deposit.defaultCashDeposit,
      categoryOverrides: input.deposit?.categoryOverrides
        ? input.deposit.categoryOverrides.map((item) => ({ ...item }))
        : [...base.deposit.categoryOverrides],
    },
    reschedule: {
      maxDaysFromBooking:
        input.reschedule?.maxDaysFromBooking ?? base.reschedule.maxDaysFromBooking,
    },
    lateReturn: {
      feePerItemPerDay: input.lateReturn?.feePerItemPerDay ?? base.lateReturn.feePerItemPerDay,
      newRentalChargeFromLateDay:
        input.lateReturn?.newRentalChargeFromLateDay ?? base.lateReturn.newRentalChargeFromLateDay,
    },
    specialCleaning: {
      feeMin: input.specialCleaning?.feeMin ?? base.specialCleaning.feeMin,
      feeMax: input.specialCleaning?.feeMax ?? base.specialCleaning.feeMax,
    },
    loyalty: {
      enabled: input.loyalty?.enabled ?? base.loyalty.enabled,
      rentalsRequired: input.loyalty?.rentalsRequired ?? base.loyalty.rentalsRequired,
      rewardRentalValue: input.loyalty?.rewardRentalValue ?? base.loyalty.rewardRentalValue,
      stackableWithPromotions:
        input.loyalty?.stackableWithPromotions ?? base.loyalty.stackableWithPromotions,
    },
  };
}

function validateResultingPolicy(policy: RentalPolicy): void {
  if (
    !Number.isInteger(policy.rentalPricing.defaultRentalPrice) ||
    policy.rentalPricing.defaultRentalPrice < 0
  ) {
    throw new BadRequestException('Default rental price must be a non-negative integer');
  }

  if (
    !Number.isInteger(policy.deposit.defaultCashDeposit) ||
    policy.deposit.defaultCashDeposit < 0
  ) {
    throw new BadRequestException('Default cash deposit must be a non-negative integer');
  }

  if (
    !Array.isArray(policy.deposit.allowedMethods) ||
    policy.deposit.allowedMethods.length === 0 ||
    policy.deposit.allowedMethods.some((m) => !['CASH', 'DOCUMENT'].includes(m))
  ) {
    throw new BadRequestException('Allowed deposit methods must include CASH or DOCUMENT');
  }

  if (
    !Array.isArray(policy.deposit.allowedDocumentTypes) ||
    policy.deposit.allowedDocumentTypes.some((d) => !['CCCD', 'GPLX'].includes(d))
  ) {
    throw new BadRequestException('Allowed document types must be CCCD or GPLX');
  }

  if (policy.deposit.categoryOverrides) {
    const seen = new Set<string>();
    for (const override of policy.deposit.categoryOverrides) {
      if (seen.has(override.categoryId)) {
        throw new BadRequestException(
          `Duplicate category override detected for categoryId: ${override.categoryId}`,
        );
      }
      seen.add(override.categoryId);
      if (!Number.isInteger(override.cashAmount) || override.cashAmount < 0) {
        throw new BadRequestException(
          'Category cash deposit override must be a non-negative integer',
        );
      }
    }
  }

  if (
    !Number.isInteger(policy.reschedule.maxDaysFromBooking) ||
    policy.reschedule.maxDaysFromBooking < 1
  ) {
    throw new BadRequestException('Max reschedule days from booking must be at least 1');
  }

  if (
    !Number.isInteger(policy.lateReturn.feePerItemPerDay) ||
    policy.lateReturn.feePerItemPerDay < 0
  ) {
    throw new BadRequestException('Late fee per item per day must be a non-negative integer');
  }

  if (
    !Number.isInteger(policy.lateReturn.newRentalChargeFromLateDay) ||
    policy.lateReturn.newRentalChargeFromLateDay < 1
  ) {
    throw new BadRequestException('New rental charge from late day must be at least 1');
  }

  if (
    !Number.isInteger(policy.specialCleaning.feeMin) ||
    policy.specialCleaning.feeMin < 0
  ) {
    throw new BadRequestException('Special cleaning minimum fee must be a non-negative integer');
  }

  if (
    !Number.isInteger(policy.specialCleaning.feeMax) ||
    policy.specialCleaning.feeMax < 0
  ) {
    throw new BadRequestException('Special cleaning maximum fee must be a non-negative integer');
  }

  if (policy.specialCleaning.feeMax < policy.specialCleaning.feeMin) {
    throw new BadRequestException(
      'Special cleaning maximum fee cannot be less than minimum fee',
    );
  }

  if (typeof policy.loyalty.enabled !== 'boolean') {
    throw new BadRequestException('Loyalty enabled must be a boolean');
  }

  if (
    !Number.isInteger(policy.loyalty.rentalsRequired) ||
    policy.loyalty.rentalsRequired < 1
  ) {
    throw new BadRequestException('Loyalty required rentals must be at least 1');
  }

  if (
    !Number.isInteger(policy.loyalty.rewardRentalValue) ||
    policy.loyalty.rewardRentalValue < 0
  ) {
    throw new BadRequestException('Loyalty reward rental value must be a non-negative integer');
  }

  if (typeof policy.loyalty.stackableWithPromotions !== 'boolean') {
    throw new BadRequestException('Loyalty stackableWithPromotions must be a boolean');
  }
}

function policyToAuditSnapshot(policy: RentalPolicy): AuditSnapshot {
  return {
    defaultRentalPrice: policy.rentalPricing.defaultRentalPrice,
    defaultCashDeposit: policy.deposit.defaultCashDeposit,
    allowedDepositMethods: [...policy.deposit.allowedMethods],
    allowedDocumentTypes: [...policy.deposit.allowedDocumentTypes],
    maxRescheduleDaysFromBooking: policy.reschedule.maxDaysFromBooking,
    lateFeePerItemPerDay: policy.lateReturn.feePerItemPerDay,
    newRentalChargeFromLateDay: policy.lateReturn.newRentalChargeFromLateDay,
    cleaningFeeMin: policy.specialCleaning.feeMin,
    cleaningFeeMax: policy.specialCleaning.feeMax,
    loyaltyEnabled: policy.loyalty.enabled,
    loyaltyRentalsRequired: policy.loyalty.rentalsRequired,
    loyaltyRewardRentalValue: policy.loyalty.rewardRentalValue,
  };
}

@Injectable()
export class SettingsService implements RentalPolicyProvider {
  constructor(
    @Inject(SETTINGS_REPOSITORY) private readonly repository: SettingsRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  list(user: CurrentUser) {
    return this.repository.list(user.shopId);
  }

  async shop(user: CurrentUser) {
    const shop = await this.repository.getShop(user.shopId);
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async upsert(user: CurrentUser, key: string, input: UpsertSettingInput) {
    const setting = await this.repository.upsert({
      shopId: user.shopId,
      key,
      value: input.value,
      description: input.description,
      updatedBy: user.memberId,
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPSERT',
      entityType: 'app_setting',
      newValues: { key },
    });
    return setting;
  }

  async updateShop(user: CurrentUser, input: UpdateShopInput) {
    const shop = await this.repository.updateShop({
      shopId: user.shopId,
      ...input,
      currency: input.currency?.toUpperCase(),
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'shop',
      entityId: user.shopId,
      newValues: { ...input },
    });
    return shop;
  }

  async getPolicy(shopId: string): Promise<RentalPolicy> {
    const saved = await this.repository.getRentalPolicy(shopId);
    return buildEffectivePolicy(saved?.policy);
  }

  async getRentalPolicy(user: CurrentUser): Promise<RentalPolicy> {
    const saved = await this.repository.getRentalPolicy(user.shopId);
    const effective = buildEffectivePolicy(saved?.policy);
    return {
      ...effective,
      updatedAt: saved?.updatedAt?.toISOString(),
    };
  }

  async updateRentalPolicy(user: CurrentUser, input: UpdateRentalPolicyInput): Promise<RentalPolicy> {
    const current = await this.getPolicy(user.shopId);
    const merged = mergePolicyInput(current, input);
    validateResultingPolicy(merged);

    const saved = await this.repository.saveRentalPolicy(user.shopId, merged, user.memberId);

    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'rental_policy',
      entityId: user.shopId,
      oldValues: policyToAuditSnapshot(current),
      newValues: policyToAuditSnapshot(saved.policy),
    });

    return {
      ...saved.policy,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
