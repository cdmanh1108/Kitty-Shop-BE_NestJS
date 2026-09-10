import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { SettingsService } from '../application/settings.service';
import { UpdateShopReqDto, UpsertSettingReqDto } from './settings.dto';

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list(@CurrentUser() user: CurrentUserType) { return this.service.list(user); }

  @Get('shop')
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  shop(@CurrentUser() user: CurrentUserType) { return this.service.shop(user); }

  @Put(':key')
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  upsert(@CurrentUser() user: CurrentUserType, @Param('key') key: string, @Body() body: UpsertSettingReqDto) { return this.service.upsert(user, key, body); }

  @Patch('shop/profile')
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  updateShop(@CurrentUser() user: CurrentUserType, @Body() body: UpdateShopReqDto) { return this.service.updateShop(user, body); }
}
