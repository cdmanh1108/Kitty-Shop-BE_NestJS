import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '@common/errors/application-error';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import type { CurrentUser } from '@common/types/current-user';
import {
  ADMIN_WEB_ACCOUNT_READER,
  type AdminWebAccountReader,
  type AdminWebAccountListCriteria,
} from '../domain/admin-web-account-reader';

class WebAccountReadForbiddenError extends ApplicationError {
  readonly kind = 'FORBIDDEN';
  constructor() {
    super('Bạn không có quyền xem tài khoản web của cửa hàng này.', 'WEB_ACCOUNT_ACCESS_DENIED');
  }
}

class WebAccountNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('Không tìm thấy tài khoản web.', 'WEB_ACCOUNT_NOT_FOUND');
  }
}

@Injectable()
export class AdminWebAccountService {
  constructor(
    @Inject(ADMIN_WEB_ACCOUNT_READER) private readonly reader: AdminWebAccountReader,
    private readonly shopResolver: ShopResolver,
  ) {}

  async list(user: CurrentUser, input: Omit<AdminWebAccountListCriteria, 'shopId'>) {
    await this.assertStorefrontShop(user.shopId);
    return this.reader.list({
      ...input,
      search: input.search?.trim() || undefined,
      shopId: user.shopId,
    });
  }

  async get(user: CurrentUser, id: string) {
    await this.assertStorefrontShop(user.shopId);
    const account = await this.reader.get(user.shopId, id);
    if (!account) throw new WebAccountNotFoundError();
    return account;
  }

  private async assertStorefrontShop(shopId: string) {
    // Accounts are global to this single-shop deployment, including accounts without orders.
    if ((await this.shopResolver.resolveShopId()) !== shopId)
      throw new WebAccountReadForbiddenError();
  }
}
