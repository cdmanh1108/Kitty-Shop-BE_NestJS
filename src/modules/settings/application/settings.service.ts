import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  buildEffectiveRentalPolicy,
  mergeRentalPolicy,
  RENTAL_POLICY_SETTING_KEY,
  type RentalPolicy,
  type RentalPolicyProvider,
  validateRentalPolicy,
} from '../domain/rental-policy';
import { InvalidShopSettingsError } from '../domain/rental-policy.errors';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/settings.repository';
import type {
  UpdateRentalPolicyInput,
  UpdateShopInput,
  UpsertSettingInput,
} from './settings.contracts';
import { toRentalPolicyAuditSnapshot } from './settings-audit.mapper';
import { ShopNotFoundError } from './settings.errors';

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
    if (!shop) throw new ShopNotFoundError();
    return shop;
  }

  async upsert(user: CurrentUser, key: string, input: UpsertSettingInput) {
    if (key === RENTAL_POLICY_SETTING_KEY) {
      throw new InvalidShopSettingsError(
        'Vui lòng cập nhật quy tắc kinh doanh tại mục chính sách thuê.',
        'RENTAL_POLICY_REQUIRES_VALIDATED_UPDATE',
      );
    }
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
    const policy = buildEffectiveRentalPolicy(saved?.policy);
    validateRentalPolicy(policy);
    return policy;
  }

  async getRentalPolicy(user: CurrentUser): Promise<RentalPolicy> {
    const saved = await this.repository.getRentalPolicy(user.shopId);
    const effective = buildEffectiveRentalPolicy(saved?.policy);
    return {
      ...effective,
      updatedAt: saved?.updatedAt?.toISOString(),
    };
  }

  async updateRentalPolicy(
    user: CurrentUser,
    input: UpdateRentalPolicyInput,
  ): Promise<RentalPolicy> {
    const current = await this.getPolicy(user.shopId);
    const next = mergeRentalPolicy(current, input);
    validateRentalPolicy(next);

    const saved = await this.repository.saveRentalPolicy(user.shopId, next, user.memberId);

    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'rental_policy',
      entityId: user.shopId,
      oldValues: toRentalPolicyAuditSnapshot(current),
      newValues: toRentalPolicyAuditSnapshot(saved.policy),
    });

    return {
      ...saved.policy,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
