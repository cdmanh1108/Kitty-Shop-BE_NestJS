import { PERMISSIONS } from '@common/constants/permissions';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SizeService } from '../../application/size.service';
import { toCreateSizeInput } from '../catalog.mapper';
import { CreateSizeReqDto } from './dto/size.dto';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminSizeController {
  constructor(private readonly service: SizeService) {}

  @Post('sizes')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createSize(@CurrentUser() user: CurrentUserType, @Body() body: CreateSizeReqDto) {
    return this.service.createSize(user, toCreateSizeInput(body));
  }
}
