import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { ReminderService } from '../application/reminder.service';
import { ReminderPageResDto, ReminderResDto } from './reminder.dto';
import { ReminderQueryDto, toReminderListQuery } from './reminder-query.dto';

@ApiSurface('admin')
@ApiTags('Reminders')
@ApiBearerAuth('access-token')
@Controller('admin/reminders')
export class ReminderController {
  constructor(private readonly service: ReminderService) {}

  @Get()
  @Permissions(PERMISSIONS.REMINDERS_VIEW)
  @ApiOkResponse({ type: ReminderPageResDto })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ReminderQueryDto) {
    return this.service.list(user, toReminderListQuery(query));
  }

  @Post('refresh')
  @Permissions(PERMISSIONS.REMINDERS_MANAGE)
  @ApiCreatedResponse()
  @ApiConflictResponse({ description: 'Đang có yêu cầu làm mới lời nhắc cho cửa hàng này.' })
  refresh(@CurrentUser() user: CurrentUserType) {
    return this.service.refreshForUser(user);
  }

  @Post(':id/dismiss')
  @Permissions(PERMISSIONS.REMINDERS_MANAGE)
  @ApiCreatedResponse({ type: ReminderResDto })
  dismiss(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.dismiss(user, id);
  }
}
