import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CategoryService } from '../../application/category.service';
import {
  CategoryListQueryDto,
  CategoryOptionResDto,
  CategoryOptionsQueryDto,
  CategoryPageResDto,
  CategoryResDto,
  CreateCategoryReqDto,
  UpdateCategoryReqDto,
} from './dto/category.dto';
import {
  toCategoryListQuery,
  toCreateCategoryInput,
  toUpdateCategoryInput,
} from '../catalog.mapper';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin/catalog')
export class AdminCategoryController {
  constructor(private readonly service: CategoryService) {}

  @Post('categories')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: CategoryResDto })
  createCategory(@CurrentUser() user: CurrentUserType, @Body() body: CreateCategoryReqDto) {
    return this.service.createCategory(user, toCreateCategoryInput(body));
  }

  @Get('categories')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: CategoryPageResDto })
  listCategories(@CurrentUser() user: CurrentUserType, @Query() query: CategoryListQueryDto) {
    return this.service.listCategories(user, toCategoryListQuery(query));
  }

  @Get('categories/options')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: [CategoryOptionResDto] })
  categoryOptions(@CurrentUser() user: CurrentUserType, @Query() query: CategoryOptionsQueryDto) {
    return this.service.categoryOptions(user, query.includeInactive);
  }

  @Patch('categories/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: CategoryResDto })
  updateCategory(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateCategoryReqDto,
  ) {
    return this.service.updateCategory(user, id, toUpdateCategoryInput(body));
  }

  @Delete('categories/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ schema: { properties: { deleted: { type: 'boolean' } } } })
  deleteCategory(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.deleteCategory(user, id);
  }
}
