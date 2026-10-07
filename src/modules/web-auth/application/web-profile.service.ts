import { Inject, Injectable } from '@nestjs/common';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import { WEB_AUTH_REPOSITORY, type WebAuthRepository } from '../domain/web-auth.repository';
import {
  normalizeWebContact,
  webAccountProfile,
  type UpdateWebProfileInput,
} from '../domain/web-account-profile';
import { webAuthError } from '../domain/web-auth.errors';

@Injectable()
export class WebProfileService {
  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    private readonly shopResolver: ShopResolver,
  ) {}

  async update(accountId: string, input: UpdateWebProfileInput) {
    const contact = normalizeWebContact(input);
    const shopId = await this.shopResolver.resolveShopId();
    const account = await this.repository.updateProfile(accountId, contact);
    if (!account) webAuthError('AUTH_REQUIRED');
    await this.audit.log({
      shopId,
      actorWebAccountId: accountId,
      action: 'UPDATE',
      entityType: 'web_account',
      entityId: accountId,
      newValues: { changedFields: ['fullName', 'phone'] },
    });
    return webAccountProfile(account);
  }
}
