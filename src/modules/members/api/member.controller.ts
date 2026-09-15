import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { MemberService } from '../application/member.service';
import { CreateMemberReqDto, UpdateMemberReqDto } from './member.dto';
import { toCreateMemberInput, toUpdateMemberInput } from './member.mapper';

@ApiSurface('admin')
@ApiTags('Members & RBAC')
@ApiBearerAuth('access-token')
@Controller('members')
export class MemberController {
  constructor(private readonly service: MemberService) {}

  @Get()
  @Permissions(PERMISSIONS.MEMBERS_MANAGE)
  list(@CurrentUser() user: CurrentUserType) {
    return this.service.list(user);
  }

  @Get('roles')
  @Permissions(PERMISSIONS.MEMBERS_MANAGE)
  roles(@CurrentUser() user: CurrentUserType) {
    return this.service.roles(user);
  }

  @Post()
  @Permissions(PERMISSIONS.MEMBERS_MANAGE)
  @ApiOperation({ summary: 'Create a shop member with one or more RBAC roles' })
  create(@CurrentUser() user: CurrentUserType, @Body() body: CreateMemberReqDto) {
    return this.service.create(user, toCreateMemberInput(body));
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MEMBERS_MANAGE)
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateMemberReqDto,
  ) {
    return this.service.update(user, id, toUpdateMemberInput(body));
  }
}
