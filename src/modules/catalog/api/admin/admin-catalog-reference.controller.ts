import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogReferenceDataService } from '../../application/catalog-reference-data.service';
import { CatalogLookupsResDto } from './dto/category.dto';

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
}
