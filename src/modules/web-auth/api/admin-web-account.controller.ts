import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { ErrorResDto } from '@common/dto/response.dto';
import { AdminWebAccountService } from '../application/admin-web-account.service';
import type { AdminWebAccountRecord } from '../domain/admin-web-account-reader';
import {
  AdminWebAccountListQueryDto,
  AdminWebAccountPageResDto,
  AdminWebAccountResDto,
} from './admin-web-account.dto';

function response(account: AdminWebAccountRecord): AdminWebAccountResDto {
  return {
    ...account,
    createdAt: account.createdAt.toISOString(),
    emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
    disabledAt: account.disabledAt?.toISOString() ?? null,
    lastRentalAt: account.lastRentalAt?.toISOString() ?? null,
  };
}

@ApiSurface('admin')
@ApiTags('Admin - Web Accounts')
@ApiBearerAuth('access-token')
@Permissions(PERMISSIONS.CUSTOMERS_VIEW)
@Controller('admin/web-accounts')
export class AdminWebAccountController {
  constructor(private readonly accounts: AdminWebAccountService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminWebAccounts',
    summary: 'Danh sách tài khoản web và hoạt động đặt thuê',
  })
  @ApiOkResponse({ type: AdminWebAccountPageResDto })
  async list(@CurrentUser() user: CurrentUserType, @Query() query: AdminWebAccountListQueryDto) {
    const page = await this.accounts.list(user, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      verification: query.verification,
      customerId: query.customerId,
    });
    return { items: page.items.map(response), meta: page.meta };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'getAdminWebAccount', summary: 'Thông tin tài khoản web chỉ xem' })
  @ApiOkResponse({ type: AdminWebAccountResDto })
  @ApiNotFoundResponse({ type: ErrorResDto })
  async get(
    @CurrentUser() user: CurrentUserType,
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new BadRequestException('Mã tài khoản web phải là UUID hợp lệ.'),
      }),
    )
    id: string,
  ) {
    return response(await this.accounts.get(user, id));
  }
}
