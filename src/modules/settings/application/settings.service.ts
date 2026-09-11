import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/settings.repository';
import type { UpdateShopInput, UpsertSettingInput } from './settings.contracts';

@Injectable()
export class SettingsService {
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
}
