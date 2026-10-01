import { PERMISSIONS } from '@common/constants/permissions';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ColorService } from '../../application/color.service';
import { toCreateColorInput } from '../catalog.mapper';
import { CreateColorReqDto } from './dto/color.dto';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminColorController {
  constructor(private readonly service: ColorService) {}

  @Post('colors')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createColor(@CurrentUser() user: CurrentUserType, @Body() body: CreateColorReqDto) {
    return this.service.createColor(user, toCreateColorInput(body));
  }
}
