import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogReferenceDataService } from '../../application/catalog-reference-data.service';
import { CatalogLookupsResDto, CreateColorReqDto, CreateSizeReqDto } from './dto/category.dto';
import { toCreateColorInput, toCreateSizeInput } from '../catalog.mapper';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminCatalogReferenceController {
  constructor(private readonly service: CatalogReferenceDataService) {}

  @Get('lookups')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: 'Categories, sizes, colors and locations for admin forms' })
  @ApiOkResponse({ type: CatalogLookupsResDto })
  lookups(@CurrentUser() user: CurrentUserType) {
    return this.service.lookups(user);
  }

  @Post('sizes')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createSize(@CurrentUser() user: CurrentUserType, @Body() body: CreateSizeReqDto) {
    return this.service.createSize(user, toCreateSizeInput(body));
  }

  @Post('colors')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createColor(@CurrentUser() user: CurrentUserType, @Body() body: CreateColorReqDto) {
    return this.service.createColor(user, toCreateColorInput(body));
  }
}
