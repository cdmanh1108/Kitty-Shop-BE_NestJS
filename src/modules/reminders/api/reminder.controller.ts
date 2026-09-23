import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { ReminderService } from '../application/reminder.service';
import { ReminderResDto } from './reminder.dto';

class ReminderQueryDto {
  @ApiPropertyOptional()
  @IsString({ message: 'Trạng thái phải là chuỗi ký tự.' })
  @IsOptional()
  status?: string;
}

@ApiSurface('admin')
@ApiTags('Reminders')
@ApiBearerAuth('access-token')
@Controller('admin/reminders')
export class ReminderController {
  constructor(private readonly service: ReminderService) {}

  @Get()
  @Permissions(PERMISSIONS.REMINDERS_VIEW)
  @ApiOkResponse({ type: [ReminderResDto] })
  list(@CurrentUser() user: CurrentUserType, @Query() query: ReminderQueryDto) {
    return this.service.list(user, query.status);
  }

  @Post('refresh')
  @Permissions(PERMISSIONS.REMINDERS_MANAGE)
  @ApiCreatedResponse()
  @ApiConflictResponse({ description: 'A refresh for this shop is already in progress.' })
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
